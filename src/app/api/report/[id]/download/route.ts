import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generateReportHtml } from "@/lib/pdf";

export const maxDuration = 30; // seconds — requires Vercel Pro

/**
 * GET /api/report/:id/download?token=...
 * Returns the generated PDF report as HTML (print-to-PDF).
 * Requires a valid download_token for authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Missing download token" },
      { status: 401 }
    );
  }

  const supabase = createServerClient();

  // Validate token and fetch report in one query
  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("lookup_id", lookupId)
    .eq("download_token", token)
    .single();

  if (!report) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  // Check report expiry
  if (new Date(report.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Report has expired. Please create a new lookup." },
      { status: 410 }
    );
  }

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
  await supabase
    .from("reports")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", report.id);

  // Return as HTML (client can use window.print() for PDF)
  // In production, pipe through Puppeteer for PDF binary
  return new NextResponse(reportHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="permitcheck-${lookupId}.html"`,
    },
  });
}
