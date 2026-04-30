import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { UUID_RE } from "@/lib/schemas";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";
import { generatePermitSummary } from "@/lib/summary";
import { fetchPropertyData } from "@/lib/property-data";
import { log } from "@/lib/logger";

export const maxDuration = 60;

/**
 * POST /api/lookup/[id]/regenerate
 *
 * Regenerates the AI summary and report for a paid lookup after a data refresh.
 * Mirrors the report-generation logic in the Stripe webhook but skips payment.
 * Only works for paid lookups that have completed scraping.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  const ip = extractClientIp(request);
  const allowed = await rateLimit(`regenerate:${ip}:${lookupId}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const supabase = createServerClient();

  // Fetch lookup — must be paid and scrape-complete
  const { data: lookup } = await supabase
    .from("lookups")
    .select("*")
    .eq("id", lookupId)
    .single();

  if (!lookup) {
    return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  }

  if (lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment required" },
      { status: 402 }
    );
  }

  // Verify caller is the same IP that initiated the lookup
  if (lookup.initiator_ip && ip !== lookup.initiator_ip) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (lookup.status !== "complete") {
    return NextResponse.json(
      { error: "Scrape not yet complete" },
      { status: 409 }
    );
  }

  // Check if a fully-generated report already exists (has ai_summary).
  // Placeholders from a prior crashed attempt (ai_summary = null) are
  // treated as non-existent and will be overwritten.
  const { data: existingReport } = await supabase
    .from("reports")
    .select("id, ai_summary")
    .eq("lookup_id", lookupId)
    .single();

  if (existingReport?.ai_summary) {
    return NextResponse.json({ status: "already_exists" });
  }

  // Delete any stale placeholder from a prior failed attempt
  if (existingReport && !existingReport.ai_summary) {
    await supabase
      .from("reports")
      .delete()
      .eq("lookup_id", lookupId);
  }

  // Fetch permits
  const { data: permits } = await supabase
    .from("permits")
    .select("*")
    .eq("lookup_id", lookupId);

  if (!permits) {
    return NextResponse.json(
      { error: "Failed to fetch permits" },
      { status: 500 }
    );
  }

  // Fetch property data (non-blocking enrichment)
  let propertyData = null;
  try {
    propertyData = await fetchPropertyData(lookup.address_normalized);
    log.info("Regenerate: property data fetched", {
      lookupId,
      hasData: !!propertyData,
    });
  } catch (err) {
    log.warn("Regenerate: property data fetch failed", {
      lookupId,
      error: String(err),
    });
  }

  // Generate AI summary
  let aiSummary: string | null = null;
  let riskLevel: string | null = null;

  try {
    const summary = await generatePermitSummary(
      permits,
      lookup.address_normalized,
      propertyData,
      lookup.listing_description || null,
      lookup.is_unit ?? false,
      lookup.development_level_permits ?? false,
      lookup.permits_truncated ?? false,
      lookup.used_fuzzy_match ?? false,
    );
    aiSummary = JSON.stringify(summary);
    riskLevel = summary.riskLevel;
    log.info("Regenerate: summary generated", { lookupId, riskLevel });
  } catch (err) {
    log.error("Regenerate: summary generation failed", {
      lookupId,
      error: String(err),
    });
  }

  // Create report record
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
    log.error("Regenerate: report insert failed", {
      lookupId,
      error: reportError.message,
    });
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 }
    );
  }

  log.info("Regenerate: report created", { lookupId, riskLevel });

  return NextResponse.json({
    status: "complete",
    risk_level: riskLevel,
  });
}
