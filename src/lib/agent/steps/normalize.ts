import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Supported zip ranges per jurisdiction. Mirrors the lists in
 * `src/lib/accela/jurisdictions.ts` but does NOT inherit that file's
 * "default to ATLANTA_GA when unrecognized" fallback — the agent layer
 * needs unrecognized to throw, not silently misclassify.
 *
 * Add DeKalb / Fulton / Cobb zips here when those data sources ship.
 */
const ATLANTA_ZIPS = new Set([
  "30301", "30302", "30303", "30304", "30305", "30306", "30307",
  "30308", "30309", "30310", "30311", "30312", "30313", "30314",
  "30315", "30316", "30317", "30318", "30319", "30324", "30326",
  "30327", "30328", "30329", "30331", "30332", "30334", "30336",
  "30338", "30339", "30340", "30341", "30342", "30344", "30345",
  "30346", "30349", "30350", "30354", "30360", "30363", "30368",
]);

const GWINNETT_ZIPS = new Set([
  "30004", "30005", "30017", "30019", "30024", "30040", "30041",
  "30043", "30044", "30045", "30046", "30047", "30052", "30078",
  "30084", "30087", "30092", "30093", "30096", "30097",
]);

function classifyZip(zip: string): NormalizeOutput["jurisdiction"] | null {
  if (ATLANTA_ZIPS.has(zip)) return "atlanta";
  if (GWINNETT_ZIPS.has(zip)) return "gwinnett";
  return null;
}

/**
 * SPEC §10 Step 1 — Address normalization (deterministic, no LLM).
 * 5s budget. Google Places (New) Text Search endpoint.
 *
 * Input: a raw address string typed by the user.
 * Output: normalized address, lat/long, Google Place ID, jurisdiction.
 *
 * Failure modes (per SPEC §10 Step 1):
 *   - Outside Atlanta-metro → throws JurisdictionNotSupportedError. The
 *     orchestrator's failure handler marks the report failed and refunds.
 *   - Ambiguous results → for MVP, we take the first result (Google Places
 *     ranks by confidence). TODO(PR-future): implement multi-candidate
 *     confirmation per SPEC §10 Step 1 "Ambiguous address → return top 3
 *     candidates, ask user to confirm" — out of PR6 scope.
 *   - No results / API failure → throws; orchestrator's retry-then-fail
 *     handler kicks in.
 */

export const normalizeInputSchema = z.object({
  address: z.string().min(5).max(200),
});
export type NormalizeInput = z.infer<typeof normalizeInputSchema>;

export const normalizeOutputSchema = z.object({
  raw_address: z.string(),
  normalized_address: z.string(),
  google_place_id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  jurisdiction: z.enum(["atlanta", "gwinnett", "dekalb", "fulton", "cobb"]),
});
export type NormalizeOutput = z.infer<typeof normalizeOutputSchema>;

/**
 * Thrown when the resolved address is outside the supported Atlanta-metro
 * jurisdictions. The orchestrator's failure handler treats this as a
 * non-retriable error and triggers the auto-refund flow.
 */
export class JurisdictionNotSupportedError extends Error {
  constructor(
    public readonly resolvedAddress: string,
    public readonly detectedJurisdiction: string,
  ) {
    super(
      `Jurisdiction not supported: address "${resolvedAddress}" resolved to ` +
      `"${detectedJurisdiction || "unknown"}", which is outside the supported ` +
      `Atlanta-metro coverage (atlanta, gwinnett, dekalb, fulton, cobb).`
    );
    this.name = "JurisdictionNotSupportedError";
  }
}

const PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

interface PlacesResponse {
  places?: Array<{
    id: string;
    formattedAddress: string;
    location?: { latitude: number; longitude: number };
  }>;
}

export async function normalize(input: NormalizeInput): Promise<NormalizeOutput> {
  const { address } = normalizeInputSchema.parse(input);

  const res = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY,
      // Field mask scopes the response — Google charges per field-set tier.
      "X-Goog-FieldMask": "places.id,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: address,
      regionCode: "US",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google Places Text Search failed: ${res.status} ${res.statusText}` +
      (body ? ` — ${body.slice(0, 200)}` : "")
    );
  }

  const data: PlacesResponse = await res.json();
  const place = data.places?.[0];
  if (!place || !place.formattedAddress || !place.location) {
    throw new Error(
      `Google Places Text Search returned no usable result for "${address}"`
    );
  }

  // Detect jurisdiction from the zip embedded in Google's formatted
  // address. Unrecognized zip → throw, not default-to-Atlanta. The
  // agent layer needs explicit coverage to claim a result.
  const zipMatch = place.formattedAddress.match(/\b(\d{5})\b/);
  const zip = zipMatch?.[1] ?? null;
  const jurisdiction = zip ? classifyZip(zip) : null;

  if (!jurisdiction) {
    throw new JurisdictionNotSupportedError(
      place.formattedAddress,
      zip ?? "no zip in formatted address",
    );
  }

  return {
    raw_address: address,
    normalized_address: place.formattedAddress,
    google_place_id: place.id,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    jurisdiction,
  };
}
