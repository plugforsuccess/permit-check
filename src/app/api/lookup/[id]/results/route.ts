import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/ratelimit";
import { UUID_RE } from "@/lib/schemas";

/**
 * GET /api/lookup/:id/results
 * Returns permit data for a confirmed, paid lookup.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await rateLimit(`results:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const supabase = createServerClient();

  // Fetch the lookup
  const { data: lookup, error: lookupError } = await supabase
    .from("lookups")
    .select("*")
    .eq("id", lookupId)
    .single();

  if (lookupError || !lookup) {
    return NextResponse.json(
      { error: "Lookup not found" },
      { status: 404 }
    );
  }

  // Check payment status
  if (lookup.payment_status !== "paid") {
    // Fetch only status and type — no record numbers or details
    const { data: teaserPermits } = await supabase
      .from("permits")
      .select("status, type")
      .eq("lookup_id", lookupId);

    // Build status breakdown
    const permits = teaserPermits ?? [];
    const statusBreakdown = permits.reduce<Record<string, number>>(
      (acc: Record<string, number>, p: { status: string; type: string }) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      },
      {}
    );

    // Check for high-signal permit types
    const hasComplaints = permits.some(
      (p: { status: string; type: string }) =>
        p.type?.toLowerCase().includes("complaint") ||
        p.type?.toLowerCase().includes("violation") ||
        p.type?.toLowerCase().includes("code")
    );

    const hasExpired = permits.some(
      (p: { status: string; type: string }) => p.status === "Expired"
    );

    // Return teaser data (status counts only, no record details)
    return NextResponse.json({
      lookup_id: lookup.id,
      address: lookup.address_raw || lookup.address_normalized,
      address_normalized: lookup.address_normalized,
      permit_count: lookup.permit_count,
      payment_status: lookup.payment_status,
      report_type: lookup.report_type || "standard",
      is_unit: lookup.is_unit ?? false,
      development_level_permits: lookup.development_level_permits ?? false,
      permits_truncated: lookup.permits_truncated ?? false,
      used_fuzzy_match: lookup.used_fuzzy_match ?? false,
      status_breakdown: statusBreakdown,
      has_complaints: hasComplaints,
      has_expired: hasExpired,
      permits: null, // Not revealed until paid
    });
  }

  // Fetch full permit data
  const { data: permits, error: permitError } = await supabase
    .from("permits")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("filed_date", { ascending: false });

  if (permitError) {
    console.error("Failed to fetch permits:", permitError);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }

  // Fetch report info
  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("lookup_id", lookupId)
    .single();

  // Parse the summary JSON
  let parsedSummary = null;
  if (report?.ai_summary) {
    try {
      parsedSummary = JSON.parse(report.ai_summary);
    } catch {
      parsedSummary = null;
    }
  }

  return NextResponse.json({
    lookup_id: lookup.id,
    address: lookup.address_raw || lookup.address_normalized,
    address_normalized: lookup.address_normalized,
    permit_count: lookup.permit_count,
    payment_status: lookup.payment_status,
    report_type: lookup.report_type || "standard",
    is_unit: lookup.is_unit ?? false,
    development_level_permits: lookup.development_level_permits ?? false,
    permits_truncated: lookup.permits_truncated ?? false,
    used_fuzzy_match: lookup.used_fuzzy_match ?? false,
    permits,
    report: report
      ? {
          id: report.id,
          download_url: report.pdf_url,
          expires_at: report.expires_at,
          summary: parsedSummary,
          risk_level: report.risk_level,
        }
      : null,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
