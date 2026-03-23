import { createServerClient } from "@/lib/supabase";
import PermitTable from "@/components/PermitTable";
import { notFound } from "next/navigation";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServerClient();

  // Look up report by share token
  const { data: report } = await supabase
    .from("reports")
    .select("*, lookups(*, permits(*))")
    .eq("share_token", token)
    .single();

  if (!report) return notFound();

  // Check share link expiry
  if (
    report.share_expires_at &&
    new Date(report.share_expires_at) < new Date()
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            This share link has expired
          </h1>
          <p className="text-gray-500 mb-6">
            Share links are valid for 7 days. Ask the report owner to
            generate a new link.
          </p>
          <a
            href="/"
            className="px-6 py-3 bg-[#0f1f3d] text-white rounded-lg font-semibold hover:bg-[#1a3560] transition-colors"
          >
            Search a property
          </a>
        </div>
      </div>
    );
  }

  const lookup = report.lookups as Record<string, unknown> | null;
  const permits = (lookup?.permits as Record<string, unknown>[]) ?? [];
  let summary = null;
  if (report.ai_summary) {
    try {
      summary = JSON.parse(report.ai_summary);
    } catch {
      // ignore
    }
  }

  const expiryDate = new Date(report.share_expires_at).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Shared report banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-blue-900">
              Shared PermitCheck Report
            </div>
            <p className="text-xs text-blue-700 mt-0.5">
              This report was shared with you. Link expires {expiryDate}.
              Data sourced from official government permit databases.
            </p>
          </div>
        </div>

        {/* Address header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Permit History</h1>
        <p className="text-gray-600 mb-6">{lookup?.address_normalized as string}</p>

        {/* AI Summary */}
        {summary && (
          <div className={`mb-6 rounded-xl border-2 p-5 ${
            summary.riskLevel === "high"
              ? "border-red-200 bg-red-50"
              : summary.riskLevel === "medium"
              ? "border-yellow-200 bg-yellow-50"
              : "border-green-200 bg-green-50"
          }`}>
            <p className={`text-base font-bold ${
              summary.riskLevel === "high" ? "text-red-900"
              : summary.riskLevel === "medium" ? "text-yellow-900"
              : "text-green-900"
            }`}>{summary.verdict}</p>
            {summary.summary && (
              <p className="text-sm text-gray-700 mt-2">{summary.summary}</p>
            )}
          </div>
        )}

        <PermitTable permits={permits as never[]} />

        {/* CTA to search own address */}
        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-500 mb-3">
            Need to check your own property?
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0f1f3d] text-white text-sm font-medium rounded-lg hover:bg-[#1a3560] transition-colors"
          >
            Search an address &rarr;
          </a>
        </div>

      </div>
    </div>
  );
}
