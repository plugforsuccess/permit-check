import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generateReportHtml } from "@/lib/pdf";
import { generatePdfFromHtml } from "@/lib/pdf-generator";
import { rateLimit } from "@/lib/ratelimit";
import { hasAgentAccess } from "@/lib/subscription";

export const maxDuration = 60; // seconds — attorney PDF generation needs more time

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

  // Rate limit: 10 downloads per minute per token to prevent abuse
  const rateLimitKey = `download:${token ?? lookupId}`;
  const allowed = await rateLimit(rateLimitKey);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many download requests. Please wait a moment." },
      { status: 429 }
    );
  }

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

  // Parse AI summary if available
  let parsedSummary = null;
  if (report.ai_summary) {
    try { parsedSummary = JSON.parse(report.ai_summary); } catch { /* ignore */ }
  }

  // Fetch agent branding if applicable
  let agentName: string | undefined;
  let brokerage: string | undefined;

  if (lookup.user_id) {
    const { data: profile } = await supabase
      .from("users")
      .select("agent_name, brokerage, subscription_status")
      .eq("id", lookup.user_id)
      .single();

    if (profile && hasAgentAccess(profile.subscription_status)) {
      agentName = profile.agent_name ?? undefined;
      brokerage = profile.brokerage ?? undefined;
    }
  }

  // Generate HTML report
  const reportHtml = generateReportHtml({
    address: lookup.address_normalized,
    lookupDate: new Date(lookup.created_at).toISOString().split("T")[0],
    lookupId: lookup.id,
    permits,
    reportType: lookup.report_type || "standard",
    matterReference: report.matter_reference ?? undefined,
    summary: parsedSummary,
    agentName,
    brokerage,
  });

  // Standard: return HTML with auto-print for browser print-to-PDF
  if (lookup.report_type !== "attorney") {
    const finalHtml = reportHtml.replace(
      "</body>",
      `<script>window.onload = function() { window.print(); }</script></body>`
    );

    return new NextResponse(finalHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="permitcheck-${lookupId}.html"`,
      },
    });
  }

  // Attorney: try serving pre-generated PDF from storage first
  if (report.pdf_storage_path) {
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("reports")
        .download(report.pdf_storage_path);

      if (!downloadError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();

        await supabase
          .from("reports")
          .update({ downloaded_at: new Date().toISOString() })
          .eq("id", report.id);

        return new NextResponse(new Uint8Array(arrayBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="permitcheck-attorney-report-${lookupId}.pdf"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    } catch (err) {
      console.warn("[download] Storage fetch failed, falling back to generation:", err);
    }
  }

  // Fall back to on-demand generation (storage miss or no pre-generated PDF)
  const pdfBuffer = await generatePdfFromHtml(reportHtml);

  // Update download timestamp
  await supabase
    .from("reports")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", report.id);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="permitcheck-attorney-report-${lookupId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
