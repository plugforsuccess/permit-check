import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";
import { generatePermitSummary } from "@/lib/summary";
import { UUID_RE } from "@/lib/schemas";
import { log } from "@/lib/logger";
import { randomBytes } from "crypto";
import { config } from "@/lib/config";
import { fetchPropertyData } from "@/lib/property-data";
import type { PermitSummary } from "@/lib/summary";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  const ip = extractClientIp(request);
  const allowed = await rateLimit(`analyze-listing:${ip}:${lookupId}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Parse and validate listing description
  const body = await request.json().catch(() => ({}));
  const listingDescription = typeof body.listing_description === "string"
    ? body.listing_description.trim().slice(0, 2000)
    : null;

  if (!listingDescription) {
    return NextResponse.json(
      { error: "listing_description is required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Fetch lookup — must be paid and complete
  const { data: lookup } = await supabase
    .from("lookups")
    .select("*")
    .eq("id", lookupId)
    .single();

  if (!lookup) {
    return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  }

  if (lookup.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment required" }, { status: 402 });
  }

  if (lookup.status !== "complete") {
    return NextResponse.json({ error: "Scrape not complete" }, { status: 409 });
  }

  // Fetch permits
  const { data: permits } = await supabase
    .from("permits")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("filed_date", { ascending: false });

  if (!permits) {
    return NextResponse.json(
      { error: "Failed to fetch permits" },
      { status: 500 }
    );
  }

  // Fetch property data (non-blocking)
  let propertyData = null;
  try {
    propertyData = await fetchPropertyData(lookup.address_normalized);
  } catch {
    // Non-fatal
  }

  // Generate AI summary WITH listing description
  let parsedSummary: PermitSummary | null = null;
  let aiSummary: string | null = null;
  let riskLevel: string | null = null;

  try {
    parsedSummary = await generatePermitSummary(
      permits,
      lookup.address_normalized,
      propertyData,
      listingDescription, // ← This is the key — pass listing text
      lookup.is_unit ?? false,
      lookup.development_level_permits ?? false,
      lookup.permits_truncated ?? false,
      lookup.used_fuzzy_match ?? false,
    );
    aiSummary = JSON.stringify(parsedSummary);
    riskLevel = parsedSummary.riskLevel;
    log.info("Listing analysis complete", { lookupId, riskLevel });
  } catch (err) {
    log.error("Listing analysis failed", { lookupId, error: String(err) });
    return NextResponse.json(
      { error: "AI analysis failed" },
      { status: 500 }
    );
  }

  // Upsert report with new summary
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.app.reportExpiryHours);
  const downloadToken = randomBytes(32).toString("hex");

  const { error: reportError } = await supabase
    .from("reports")
    .upsert(
      {
        lookup_id: lookupId,
        pdf_url: `/api/report/${lookupId}/download?token=${downloadToken}`,
        expires_at: expiresAt.toISOString(),
        download_token: downloadToken,
        ai_summary: aiSummary,
        risk_level: riskLevel,
      },
      { onConflict: "lookup_id", ignoreDuplicates: false }
    );

  if (reportError) {
    log.error("Listing analysis: report upsert failed", {
      lookupId,
      error: reportError.message,
    });
    return NextResponse.json(
      { error: "Failed to save analysis" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "complete",
    risk_level: riskLevel,
    summary: parsedSummary,
  });
}
