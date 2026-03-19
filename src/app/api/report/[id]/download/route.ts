import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generateReportHtml } from "@/lib/pdf";

/**
 * GET /api/report/:id/download
 * Returns the generated PDF report as HTML (print-to-PDF).
 * In production, use Puppeteer to generate actual PDF binary.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  const supabase = createServerClient();

  // Verify the lookup exists and is paid
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

  if (lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment required" },
      { status: 402 }
    );
  }

  // Check report expiry
  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("lookup_id", lookupId)
    .single();

  if (report && new Date(report.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Report has expired. Please create a new lookup." },
      { status: 410 }
    );
  }

  // Fetch permits
  const { data: permits } = await supabase
    .from("permits")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("filed_date", { ascending: false });

  if (!permits) {
    return NextResponse.json(
      { error: "No permit data found" },
      { status: 404 }
    );
  }

  // Generate HTML report
  const reportHtml = generateReportHtml({
    address: lookup.address_normalized,
    lookupDate: new Date(lookup.created_at).toISOString().split("T")[0],
    lookupId: lookup.id,
    permits,
    reportType: lookup.report_type || "standard",
  });

  // Update download timestamp
  if (report) {
    await supabase
      .from("reports")
      .update({ downloaded_at: new Date().toISOString() })
      .eq("id", report.id);
  }

  // Return as HTML (client can use window.print() for PDF)
  // In production, pipe through Puppeteer for PDF binary
  return new NextResponse(reportHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="permitcheck-${lookupId}.html"`,
    },
  });
}
