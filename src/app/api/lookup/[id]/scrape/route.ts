import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { scrapeAccelaPermits } from "@/lib/accela/index";
import { scrapedPermitSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";

export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;
  const supabase = createServerClient();

  // Fetch the lookup row
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, address_normalized, jurisdiction_id, status, is_unit, base_address")
    .eq("id", lookupId)
    .single();

  if (!lookup) {
    return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  }

  // Already complete — don't re-scrape
  if (lookup.status === "complete") {
    return NextResponse.json({ status: "already_complete" });
  }

  try {
    // Parse address into scraper components
    const parts = lookup.address_normalized.split(/\s+/);
    const streetNumber = parts[0];
    const streetName = parts.slice(1).join(" ");

    log.info("Starting scrape", { lookupId, streetNumber, streetName });

    const permits = await scrapeAccelaPermits(
      streetNumber,
      streetName,
      lookup.jurisdiction_id ?? "ATLANTA_GA"
    );

    // Deduplicate permits by record_number — keep first occurrence
    const seen = new Set<string>();
    let uniquePermits = permits.filter((p) => {
      if (seen.has(p.recordNumber)) return false;
      seen.add(p.recordNumber);
      return true;
    });

    // Secondary scrape — if zero results and this is a unit address,
    // try the base address (development-level permits)
    let usedDevelopmentPermits = false;

    if (uniquePermits.length === 0 && lookup.is_unit && lookup.base_address) {
      log.info("Zero results on unit address — retrying base address", {
        lookupId,
        baseAddress: lookup.base_address,
      });

      try {
        const baseParts = lookup.base_address.split(/\s+/);
        const baseStreetNumber = baseParts[0];
        const baseStreetName = baseParts.slice(1).join(" ");

        const basePermits = await scrapeAccelaPermits(
          baseStreetNumber,
          baseStreetName,
          lookup.jurisdiction_id ?? "ATLANTA_GA"
        );

        if (basePermits.length > 0) {
          // Deduplicate base permits
          const baseSeen = new Set<string>();
          uniquePermits = basePermits.filter((p) => {
            if (baseSeen.has(p.recordNumber)) return false;
            baseSeen.add(p.recordNumber);
            return true;
          });
          usedDevelopmentPermits = true;
          log.info("Found development-level permits at base address", {
            lookupId,
            baseAddress: lookup.base_address,
            count: uniquePermits.length,
          });
        }
      } catch (err) {
        log.warn("Base address scrape failed", {
          lookupId,
          baseAddress: lookup.base_address,
          error: String(err),
        });
        // Don't throw — zero permits is still a valid result
      }
    }

    const validPermits = uniquePermits.filter(
      (p) => scrapedPermitSchema.safeParse(p).success
    );

    // Update lookup to complete with unit metadata
    await supabase
      .from("lookups")
      .update({
        status: "complete",
        permit_count: validPermits.length,
        development_level_permits: usedDevelopmentPermits,
      })
      .eq("id", lookupId);

    // Insert permits
    if (validPermits.length > 0) {
      await supabase.from("permits").insert(
        validPermits.map((p) => ({
          lookup_id: lookupId,
          record_number: p.recordNumber,
          type: p.type,
          status: p.status,
          filed_date: p.filedDate,
          issued_date: p.issuedDate,
          description: p.description,
          address: p.address,
        }))
      );
    }

    log.info("Scrape complete", {
      lookupId,
      count: validPermits.length,
      isUnit: lookup.is_unit,
      usedDevelopmentPermits,
    });
    return NextResponse.json({ status: "complete", count: validPermits.length });
  } catch (err) {
    await supabase
      .from("lookups")
      .update({ status: "error" })
      .eq("id", lookupId);
    log.error("Scrape failed", { lookupId, error: String(err) });
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  }
}
