import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  scrapeAccelaPermits,
  detectJurisdiction,
  isZipSupported,
} from "@/lib/accela/index";
import type { PermitRecord } from "@/lib/accela/index";
import { normalizeAddress, validateAddress } from "@/lib/address";
import { lookupInitiateSchema, scrapedPermitSchema } from "@/lib/schemas";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/logger";

export const maxDuration = 300; // 5 minutes — Vercel Pro max

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 requests per minute per IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const allowed = await rateLimit(clientIp);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    const raw = await request.json();
    const parsed = lookupInitiateSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { address } = parsed.data;

    // Resolve user from auth token (optional — anonymous lookups allowed)
    let userId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabaseAuth = createServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Validate address format
    const validation = validateAddress(address);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // 1. Normalize address
    const addressNormalized = normalizeAddress(address);

    // Use structured components from Google Places when available
    let streetNumber: string;
    let streetName: string;

    if (parsed.data.address_components) {
      streetNumber = parsed.data.address_components.streetNumber;
      streetName = parsed.data.address_components.streetName;
    } else {
      const parts = addressNormalized.split(/\s+/);
      streetNumber = parts[0];
      streetName = parts.slice(1).join(" ");
    }

    // Detect jurisdiction from the full address (before normalization strips zip)
    const jurisdictionId = detectJurisdiction(address);
    log.info("Jurisdiction detected", { jurisdictionId, address: addressNormalized });

    // Warn if zip code isn't in a supported jurisdiction
    if (!isZipSupported(address)) {
      return NextResponse.json(
        {
          error:
            "This zip code is not yet in a supported jurisdiction. We currently cover Atlanta and Gwinnett County.",
        },
        { status: 422 }
      );
    }

    // 2. Check Supabase cache — if address looked up in last 24h, return cached result
    const supabase = createServerClient();
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: cachedLookup } = await supabase
      .from("lookups")
      .select("id, address_normalized, permit_count, created_at, jurisdiction_id, status")
      .eq("address_normalized", addressNormalized)
      .eq("status", "complete")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cachedLookup) {
      // Fetch cached permits
      const { data: cachedPermits } = await supabase
        .from("permits")
        .select("*")
        .eq("lookup_id", cachedLookup.id);

      return NextResponse.json({
        lookup_id: cachedLookup.id,
        address_normalized: cachedLookup.address_normalized,
        permits: (cachedPermits || []).map(dbPermitToResponse),
        total_count: cachedLookup.permit_count || 0,
        source: "cache",
        cached: true,
        jurisdiction_id: cachedLookup.jurisdiction_id ?? jurisdictionId,
      });
    }

    // 3. Cache miss — insert pending lookup row
    const { data: lookup, error: lookupError } = await supabase
      .from("lookups")
      .insert({
        address_raw: address,
        address_normalized: addressNormalized,
        status: "pending",
        report_type: parsed.data.report_type,
        user_id: userId,
        jurisdiction_id: jurisdictionId,
      })
      .select("id")
      .single();

    if (lookupError || !lookup) {
      log.error("Failed to create lookup", { error: lookupError?.message });
      return NextResponse.json(
        { error: "Failed to initiate lookup" },
        { status: 500 }
      );
    }

    const lookupId = lookup.id;

    // 4. Return immediately — don't await scraper
    const response = NextResponse.json({
      lookup_id: lookupId,
      cached: false,
      jurisdiction_id: jurisdictionId,
    });

    // 5. Fire scraper in background using waitUntil
    const ctx = (request as any)[Symbol.for("next.request.context")];
    const waitUntil = ctx?.waitUntil?.bind(ctx);

    const scrapeJob = (async () => {
      try {
        let permits: PermitRecord[] = [];
        const MAX_SCRAPE_RETRIES = 2;

        for (let attempt = 0; attempt <= MAX_SCRAPE_RETRIES; attempt++) {
          try {
            permits = await scrapeAccelaPermits(streetNumber, streetName, jurisdictionId);
            break;
          } catch (error) {
            log.error("Accela scraping failed", {
              attempt: attempt + 1,
              maxAttempts: MAX_SCRAPE_RETRIES + 1,
              error: String(error),
            });
            if (attempt === MAX_SCRAPE_RETRIES) throw error;
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
        }

        // Validate permits
        const validPermits = permits.filter((p) => scrapedPermitSchema.safeParse(p).success);
        if (validPermits.length < permits.length) {
          log.warn("Some scraped permits failed validation", {
            total: permits.length,
            valid: validPermits.length,
            lookupId,
          });
        }

        // Update lookup with results
        await supabase
          .from("lookups")
          .update({
            status: "complete",
            permit_count: validPermits.length,
          })
          .eq("id", lookupId);

        // Insert individual permit rows
        if (validPermits.length > 0) {
          const permitsToInsert = validPermits.map((p) => ({
            lookup_id: lookupId,
            record_number: p.recordNumber,
            type: p.type,
            status: p.status,
            filed_date: p.filedDate,
            issued_date: p.issuedDate,
            description: p.description,
            address: p.address,
          }));

          const { error: permitError } = await supabase
            .from("permits")
            .insert(permitsToInsert);

          if (permitError) {
            log.error("Failed to store permits", { error: permitError.message, lookupId });
          }
        }
      } catch (err) {
        await supabase
          .from("lookups")
          .update({ status: "error" })
          .eq("id", lookupId);
        log.error("[initiate] scrape failed:", { error: String(err), lookupId });
      }
    })();

    if (waitUntil) {
      waitUntil(scrapeJob);
    } else {
      scrapeJob.catch(console.error);
    }

    return response;
  } catch (error) {
    log.error("Lookup initiation error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function scraperPermitToResponse(p: PermitRecord) {
  return {
    record_number: p.recordNumber,
    type: p.type,
    status: p.status,
    filed_date: p.filedDate,
    issued_date: p.issuedDate,
    description: p.description,
    address: p.address,
  };
}

interface DbPermitRow {
  record_number: string;
  type: string;
  status: string;
  filed_date: string | null;
  issued_date: string | null;
  description: string;
  address: string;
}

function dbPermitToResponse(p: DbPermitRow) {
  return {
    record_number: p.record_number,
    type: p.type,
    status: p.status,
    filed_date: p.filed_date,
    issued_date: p.issued_date,
    description: p.description,
    address: p.address,
  };
}
