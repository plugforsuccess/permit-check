import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  detectJurisdiction,
  isZipSupported,
} from "@/lib/accela/index";
import { normalizeAddress, validateAddress } from "@/lib/address";
import { lookupInitiateSchema } from "@/lib/schemas";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/logger";

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

    // Normalize address
    const addressNormalized = normalizeAddress(address);

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

    // Check Supabase cache — if address looked up in last 24h, return cached result
    const supabase = createServerClient();
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: cachedLookup } = await supabase
      .from("lookups")
      .select("id, jurisdiction_id, status")
      .eq("address_normalized", addressNormalized)
      .eq("status", "complete")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cachedLookup) {
      return NextResponse.json({
        lookup_id: cachedLookup.id,
        cached: true,
        jurisdiction_id: cachedLookup.jurisdiction_id ?? jurisdictionId,
      });
    }

    // Cache miss — insert pending lookup row
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

    return NextResponse.json({
      lookup_id: lookup.id,
      cached: false,
      jurisdiction_id: jurisdictionId,
    });
  } catch (error) {
    log.error("Lookup initiation error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
