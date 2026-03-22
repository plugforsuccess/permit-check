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
    .select("id, address_normalized, jurisdiction_id, status")
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

    const validPermits = permits.filter(
      (p) => scrapedPermitSchema.safeParse(p).success
    );

    // Update lookup to complete
    await supabase
      .from("lookups")
      .update({ status: "complete", permit_count: validPermits.length })
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

    log.info("Scrape complete", { lookupId, count: validPermits.length });
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
