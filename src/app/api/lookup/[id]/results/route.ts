import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/lookup/:id/results
 * Returns permit data for a confirmed, paid lookup.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

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
    // Return teaser data (address and count only, no permit details)
    return NextResponse.json({
      lookup_id: lookup.id,
      address: lookup.address_raw || lookup.address_normalized,
      address_normalized: lookup.address_normalized,
      permit_count: lookup.permit_count,
      payment_status: lookup.payment_status,
      report_type: lookup.report_type || "standard",
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
  });
}
