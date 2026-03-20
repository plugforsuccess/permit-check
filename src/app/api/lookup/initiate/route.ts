import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  scrapeAccelaPermits,
  normalizeAddress as normalizeAccelaAddress,
} from "@/lib/accela/index";
import type { PermitRecord } from "@/lib/accela/index";
import { normalizeAddress, validateAddress } from "@/lib/address";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    // 1. Validate input
    const validation = validateAddress(address);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // 2. Normalize address
    const addressNormalized = normalizeAddress(address);
    const { streetNumber, streetName } = normalizeAccelaAddress(address);

    // 3. Check Supabase cache — if address looked up in last 24h, return cached result
    const supabase = createServerClient();
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: cachedLookup } = await supabase
      .from("lookups")
      .select("id, address_normalized, permit_count, created_at")
      .eq("address_normalized", addressNormalized)
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
      });
    }

    // 4. No cache hit — scrape Accela portal
    console.log(
      `[lookup/initiate] Scraping Accela for: ${streetNumber} ${streetName}`
    );
    const permits: PermitRecord[] = await scrapeAccelaPermits(
      streetNumber,
      streetName
    );

    // 5. Store result in Supabase (lookups + permits tables)
    const { data: lookup, error: lookupError } = await supabase
      .from("lookups")
      .insert({
        address_raw: address,
        address_normalized: addressNormalized,
        permit_count: permits.length,
      })
      .select()
      .single();

    if (lookupError) {
      console.error("Failed to create lookup:", lookupError);
      return NextResponse.json(
        { error: "Failed to initiate lookup" },
        { status: 500 }
      );
    }

    // Store permits
    if (permits.length > 0) {
      const permitsToInsert = permits.map((p) => ({
        lookup_id: lookup.id,
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
        console.error("Failed to store permits:", permitError);
      }
    }

    // 6. Return permit data
    return NextResponse.json({
      lookup_id: lookup.id,
      address_normalized: addressNormalized,
      permits: permits.map(scraperPermitToResponse),
      total_count: permits.length,
      source: "accela_scraper",
      cached: false,
    });
  } catch (error) {
    console.error("Lookup initiation error:", error);
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

function dbPermitToResponse(p: Record<string, unknown>) {
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
