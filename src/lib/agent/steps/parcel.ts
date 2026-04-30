import { z } from "zod";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import { normalizeOutputSchema, type NormalizeOutput } from "./normalize";

/**
 * SPEC §10 Step 2 — Parcel resolution (deterministic, no LLM).
 * 5s budget.
 *
 * What this step does:
 *   1. Fetches property characteristics (year_built, square_feet,
 *      property_type, parcel_id) from REAPI for the resolved address.
 *   2. UPSERTs a row into the shared `properties` table keyed on
 *      `normalized_address` so cache hits across users (the unit-economics
 *      story per SPEC §4 / CLAUDE.md "Database boundary").
 *   3. Returns a typed ParcelOutput consumed by the planning step (3).
 *
 * Open scope (acknowledged in PR6 description per Cameron's guidance):
 * the four output fields (parcel_id, year_built, square_feet,
 * property_type) plus normalize.ts's six fields populate the entire
 * `properties` row. PR9's analysis prompt consumes year_built (for
 * unattested-system age logic), property_type (for unit detection), and
 * square_feet (for footprint comparison via the compare_footprint tool).
 * If PR9 needs additional property-level fields, that's a future
 * migration, not a PR6 retrofit.
 *
 * Failure modes:
 *   - REAPI returns nothing → all fields null. Step still succeeds; the
 *     planning step will emit a "limited data" caveat (per SPEC §5
 *     "Data insufficient" path).
 *   - REAPI HTTP error → throws. Orchestrator's failure handler catches.
 */

export const parcelInputSchema = z.object({
  normalized: normalizeOutputSchema,
});
export type ParcelInput = z.infer<typeof parcelInputSchema>;

export const parcelOutputSchema = z.object({
  parcel_id: z.string().nullable(),
  year_built: z.number().int().nullable(),
  square_feet: z.number().int().nullable(),
  property_type: z.string().nullable(),
});
export type ParcelOutput = z.infer<typeof parcelOutputSchema>;

const REAPI_DETAIL_URL = "https://api.realestateapi.com/v2/PropertyDetail";

interface ReapiPropertyInfo {
  apn?: string;
  parcelNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  livingSquareFeet?: number;
  squareFeet?: number;
  yearBuilt?: number;
  propertyUseCode?: string;
  propertyType?: string;
}

interface ReapiResponse {
  data?: {
    propertyInfo?: ReapiPropertyInfo;
  };
}

/**
 * Pull property characteristics from REAPI. Returns all-null fields
 * (instead of throwing) when REAPI is misconfigured or returns no data —
 * the agent loop continues, the planning step emits a limited-data caveat.
 * Throws only on actual HTTP errors.
 */
async function fetchPropertyCharacteristics(
  normalizedAddress: string,
): Promise<ParcelOutput> {
  if (!env.REAPI_API_KEY) {
    log.warn("parcel: REAPI_API_KEY not set — returning null fields", {
      step_name: "parcel",
      event_type: "config_missing",
    });
    return { parcel_id: null, year_built: null, square_feet: null, property_type: null };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  let res: Response;
  try {
    res = await fetch(REAPI_DETAIL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.REAPI_API_KEY,
      },
      body: JSON.stringify({
        address: normalizedAddress,
        include: ["propertyInfo"],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(
      `REAPI PropertyDetail failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as ReapiResponse;
  const p = data?.data?.propertyInfo ?? {};

  return {
    parcel_id: p.apn ?? p.parcelNumber ?? null,
    year_built: p.yearBuilt ?? null,
    square_feet: p.livingSquareFeet ?? p.squareFeet ?? null,
    property_type: p.propertyUseCode ?? p.propertyType ?? null,
  };
}

/**
 * UPSERT the property row keyed on `normalized_address`. Returns the
 * row's UUID for downstream use (orchestrator stamps it on
 * `reports_v2.property_id` when the report finalizes).
 */
async function upsertPropertyRow(
  normalized: NormalizeOutput,
  parcel: ParcelOutput,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("properties")
    .upsert(
      {
        raw_address: normalized.raw_address,
        normalized_address: normalized.normalized_address,
        google_place_id: normalized.google_place_id,
        parcel_id: parcel.parcel_id,
        jurisdiction: normalized.jurisdiction,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        year_built: parcel.year_built,
        square_feet: parcel.square_feet,
        property_type: parcel.property_type,
      },
      { onConflict: "normalized_address", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `parcel: properties UPSERT failed — ${error?.message ?? "no row returned"}`,
    );
  }

  return data.id as string;
}

export async function parcel(input: ParcelInput): Promise<ParcelOutput> {
  const { normalized } = parcelInputSchema.parse(input);

  // 1. Pull characteristics from REAPI (or all-null if unavailable).
  const characteristics = await fetchPropertyCharacteristics(
    normalized.normalized_address,
  );

  // 2. Cache-write into the shared properties table. Multiple users
  //    looking at the same address share this row (30-day TTL enforced
  //    in code, not schema — separate cache-eviction concern).
  const propertyId = await upsertPropertyRow(normalized, characteristics);
  log.info("parcel: properties row upserted", {
    step_name: "parcel",
    event_type: "properties_upserted",
    property_id: propertyId,
    parcel_id: characteristics.parcel_id,
    has_year_built: characteristics.year_built !== null,
  });

  return characteristics;
}
