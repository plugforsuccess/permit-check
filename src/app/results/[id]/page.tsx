"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PermitTable from "@/components/PermitTable";
import PermitTeaser from "@/components/PermitTeaser";
import PropertyStreetView from "@/components/PropertyStreetView";
import ReferralCTAs from "@/components/ReferralCTAs";
import Disclaimer from "@/components/Disclaimer";
import type { Permit } from "@/types";

interface LookupResult {
  lookup_id: string;
  address: string;
  address_normalized: string;
  permit_count: number;
  payment_status: "pending" | "paid" | "failed";
  report_type: "standard" | "attorney";
  is_unit?: boolean;
  development_level_permits?: boolean;
  permits_truncated?: boolean;
  status_breakdown?: Record<string, number>;
  has_complaints?: boolean;
  has_expired?: boolean;
  permits: Permit[] | null;
  report: {
    id: string;
    download_url: string;
    expires_at: string;
    summary?: {
      riskLevel: "low" | "medium" | "high";
      verdict: string;
      summary: string;
      flags: string[];
      positives: string[];
      sellerQuestions: string[];
      listingNotes: string[];
    } | null;
    risk_level?: string | null;
  } | null;
}

interface LookupStatus {
  lookup_id: string;
  paid: boolean;
  permit_count: number;
  address_normalized: string;
}

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const lookupId = params.id as string;
  const paymentSuccess = searchParams.get("payment") === "success";

  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pollingForPayment, setPollingForPayment] = useState(false);
  const [matterReference, setMatterReference] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [watchEmail, setWatchEmail] = useState("");
  const [watchAdded, setWatchAdded] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<1 | -1 | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleFeedback = async (rating: 1 | -1) => {
    if (feedbackSubmitted) return;
    setFeedbackRating(rating);

    try {
      await fetch(`/api/report/${lookupId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      setFeedbackSubmitted(true);
    } catch {
      // Ignore — feedback is non-critical
    }
  };

  const handleAddWatch = async () => {
    if (!watchEmail || watchAdded) return;
    setWatchLoading(true);
    setWatchError(null);

    try {
      const res = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: result?.address_normalized,
          email: watchEmail,
          lookup_id: lookupId,
        }),
      });

      if (res.ok) {
        setWatchAdded(true);
      } else {
        const data = await res.json().catch(() => null);
        setWatchError(
          data?.error ?? "Unable to start monitoring. Please try again."
        );
      }
    } catch {
      setWatchError("Unable to start monitoring. Please try again.");
    } finally {
      setWatchLoading(false);
    }
  };

  const handleShare = async () => {
    if (!result?.report?.download_url) return;
    setShareLoading(true);
    try {
      // Extract download token from the report URL for authorization
      const downloadUrl = new URL(result.report.download_url, window.location.origin);
      const downloadToken = downloadUrl.searchParams.get("token");

      const res = await fetch(`/api/report/${lookupId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: downloadToken }),
      });
      const data = await res.json();
      if (data.share_url) {
        setShareUrl(data.share_url);
        try {
          await navigator.clipboard.writeText(data.share_url);
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 3000);
        } catch {
          // Clipboard API unavailable (HTTP or denied) — URL shown via state
        }
      }
    } catch {
      // ignore
    } finally {
      setShareLoading(false);
    }
  };

  const fetchResults = useCallback(async () => {
    try {
      const response = await fetch(`/api/lookup/${lookupId}/results`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load results");
        return;
      }

      setResult(data);
    } catch {
      setError("Unable to load results. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [lookupId]);

  // Poll the status endpoint after payment redirect (with backoff)
  useEffect(() => {
    if (!paymentSuccess) return;

    setPollingForPayment(true);
    let attempts = 0;
    const maxAttempts = 6;
    let timeoutId: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/lookup/${lookupId}/status`);
        const status: LookupStatus = await response.json();

        if (status.paid) {
          setPollingForPayment(false);
          fetchResults();
          return;
        }
      } catch {
        // Ignore polling errors, will retry
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setPollingForPayment(false);
        fetchResults(); // Final fetch regardless
        return;
      }
      // Backoff: 1s, 2s, 3s, 4s, 5s, 5s
      const delay = Math.min(1000 * attempts, 5000);
      timeoutId = setTimeout(poll, delay);
    };

    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [paymentSuccess, lookupId, fetchResults]);

  // Initial fetch (only if not waiting for payment)
  useEffect(() => {
    if (!paymentSuccess) {
      fetchResults();
    }
  }, [paymentSuccess, fetchResults]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookup_id: lookupId,
          matter_reference: matterReference || undefined,
          listing_description: listingDescription || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create checkout session");
        setCheckoutLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url;
    } catch {
      setError("Unable to initiate payment. Please try again.");
      setCheckoutLoading(false);
    }
  };

  if (loading || pollingForPayment) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-4xl mx-auto" role="status" aria-label={pollingForPayment ? "Confirming payment" : "Loading results"}>
          {/* Skeleton street view */}
          <div className="mb-6 h-32 sm:h-48 bg-gray-100 rounded-xl animate-pulse" />
          {/* Skeleton header */}
          <div className="mb-8">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="h-5 w-72 bg-gray-100 rounded animate-pulse mb-3" />
            <div className="flex gap-3">
              <div className="h-7 w-36 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-7 w-24 bg-gray-100 rounded-full animate-pulse" />
            </div>
          </div>
          {/* Skeleton table rows */}
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            {pollingForPayment ? "Confirming your payment..." : "Loading permit results..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchResults();
              }}
              className="px-6 py-3 bg-[#0f1f3d] text-white rounded-lg font-semibold hover:bg-[#1a3560] transition-colors"
            >
              Retry
            </button>
            <a
              href="/"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Try Another Address
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isPaid = result.payment_status === "paid";
  const permitCount = result.permit_count ?? 0;

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><a href="/" className="hover:text-gray-900 transition-colors">Home</a></li>
            <li aria-hidden="true" className="text-gray-300">/</li>
            <li className="text-gray-900 font-medium truncate max-w-[200px] sm:max-w-none">
              {result.address_normalized || result.address}
            </li>
          </ol>
        </nav>

        {/* Payment Success Banner */}
        {paymentSuccess && isPaid && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <svg
              className="w-6 h-6 text-green-600 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-green-800 font-medium">
              Payment confirmed! Your full permit report is ready.
            </p>
          </div>
        )}

        {/* Street View */}
        <div className="mb-6 street-view-wrapper">
          <div className="h-32 sm:h-48">
            <PropertyStreetView address={result.address_normalized || result.address} />
          </div>
        </div>

        {/* Address Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Permit History
          </h1>
          <p className="text-base sm:text-lg text-gray-600">{result.address}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {isPaid && (
              <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {permitCount} permit record{permitCount !== 1 ? "s" : ""} found
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                isPaid
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {isPaid ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Unlocked
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  Locked
                </>
              )}
            </span>
          </div>
        </div>

        {/* STATE 2: Paid — full results */}
        {isPaid && result.permits ? (
          <>
            {/* Download button */}
            {result.report ? (
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <a
                  href={result.report.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0f1f3d] text-white text-sm font-medium rounded-lg hover:bg-[#1a3560] transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download PDF Report
                </a>
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-[#0f1f3d] text-sm font-medium rounded-lg border border-[#0f1f3d] hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  {shareCopied ? "Link copied!" : shareLoading ? "Generating..." : "Share Report"}
                </button>
                {shareUrl && !shareCopied && (
                  <input
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full sm:w-auto px-3 py-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg font-mono"
                  />
                )}
              </div>
            ) : (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
                <svg
                  className="animate-spin h-5 w-5 text-yellow-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <p className="text-yellow-800 text-sm">
                  Generating your report&hellip; This usually takes a few seconds.
                </p>
                <button
                  onClick={() => fetchResults()}
                  className="ml-auto text-sm px-4 py-1.5 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition-colors shrink-0"
                >
                  Refresh
                </button>
              </div>
            )}

            {/* Zero-permit contextual notice */}
            {isPaid && permitCount === 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-blue-900 mb-1">
                      No permits found at this address
                    </div>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      {result.is_unit
                        ? "This appears to be a condo, townhome, or unit address. Permits for individual units are typically filed at the building or development level — zero unit-level permits is normal and expected for this property type."
                        : "No permit records were found at this address in the official database. See the AI analysis below for context on what this means for this specific property."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Development-level permits notice */}
            {isPaid && result.development_level_permits && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-amber-900 mb-1">
                      Showing development-level permits
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      No permits were found at the specific unit address. The permits
                      below were found at the base building address and represent
                      development or building-level work — not unit-specific permits.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Truncation warning */}
            {isPaid && result.permits_truncated && (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-orange-600 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-orange-900 mb-1">
                      Permit records may be incomplete
                    </div>
                    <p className="text-xs text-orange-800 leading-relaxed">
                      This property has a large number of permit records and the search
                      results were truncated. The permits shown below may not represent the
                      complete history. We recommend requesting full permit records directly
                      from the local jurisdiction for a comprehensive review.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Permit Summary */}
            {result.report?.summary && (
              <div className={`mb-6 rounded-xl border-2 p-5 ${
                result.report.summary.riskLevel === "high"
                  ? "border-red-200 bg-red-50"
                  : result.report.summary.riskLevel === "medium"
                  ? "border-yellow-200 bg-yellow-50"
                  : "border-green-200 bg-green-50"
              }`}>
                {/* Risk badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    result.report.summary.riskLevel === "high"
                      ? "bg-red-100 text-red-800"
                      : result.report.summary.riskLevel === "medium"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-green-100 text-green-800"
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      result.report.summary.riskLevel === "high"
                        ? "bg-red-500"
                        : result.report.summary.riskLevel === "medium"
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`} />
                    {result.report.summary.riskLevel === "high"
                      ? "High Risk"
                      : result.report.summary.riskLevel === "medium"
                      ? "Medium Risk"
                      : "Low Risk"}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    AI Due Diligence Analysis
                  </span>
                </div>

                {/* Verdict — bold, direct */}
                <p className={`text-base font-bold leading-snug mb-2 ${
                  result.report.summary.riskLevel === "high"
                    ? "text-red-900"
                    : result.report.summary.riskLevel === "medium"
                    ? "text-yellow-900"
                    : "text-green-900"
                }`}>
                  {result.report.summary.verdict ?? result.report.summary.summary}
                </p>

                {/* Summary */}
                {result.report.summary.summary && (
                  <p className="text-sm leading-relaxed text-gray-700 mb-4">
                    {result.report.summary.summary}
                  </p>
                )}

                {/* Listing notes — only shown if listing description was provided */}
                {result.report.summary.listingNotes.length > 0 && (
                  <div className="mb-4 p-3 bg-white/60 rounded-lg border border-gray-200">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                      Listing vs. Permit Records
                    </div>
                    <ul className="space-y-1">
                      {result.report.summary.listingNotes.map((note, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-amber-500 mt-0.5 shrink-0">&#x26A0;</span>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Red flags */}
                {result.report.summary.flags.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Red Flags
                    </div>
                    <ul className="space-y-1">
                      {result.report.summary.flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                          <span className="text-red-500 mt-0.5 shrink-0">&#x2715;</span>
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Positive signals */}
                {result.report.summary.positives.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Positive Signals
                    </div>
                    <ul className="space-y-1">
                      {result.report.summary.positives.map((pos, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                          <span className="text-green-600 mt-0.5 shrink-0">&#x2713;</span>
                          {pos}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* What to ask the seller */}
                {result.report.summary.sellerQuestions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      What to ask the seller
                    </div>
                    <ul className="space-y-2">
                      {result.report.summary.sellerQuestions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-[#0f1f3d] font-bold mt-0.5 shrink-0">
                            {i + 1}.
                          </span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    AI analysis based on official permit records
                    {result.report.summary.listingNotes.length > 0
                      ? " and listing description provided"
                      : ""}
                    . Not legal advice.
                  </p>
                  {!feedbackSubmitted ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 mr-1">Helpful?</span>
                      <button
                        onClick={() => handleFeedback(1)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          feedbackRating === 1
                            ? "bg-green-100 text-green-700"
                            : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                        }`}
                        aria-label="Helpful"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleFeedback(-1)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          feedbackRating === -1
                            ? "bg-red-100 text-red-700"
                            : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                        }`}
                        aria-label="Not helpful"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Thanks for your feedback</span>
                  )}
                </div>
              </div>
            )}

            {/* Referral CTAs — shown only after payment, based on risk level */}
            {result.report?.summary?.riskLevel && (
              <ReferralCTAs
                riskLevel={result.report.summary.riskLevel}
                address={result.address_normalized || result.address}
              />
            )}

            <PermitTable permits={result.permits} />

            {/* Watchlist opt-in */}
            {!watchAdded ? (
              <div className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-start gap-3 mb-4">
                  <svg className="w-5 h-5 text-[#c9a84c] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-1">
                      Monitor this address for free
                    </div>
                    <p className="text-xs text-gray-500">
                      Get email alerts if new permits are filed at this address over
                      the next 30 days. Useful if you&apos;re under contract or still
                      deciding.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={watchEmail}
                    onChange={(e) => setWatchEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
                  />
                  <button
                    onClick={handleAddWatch}
                    disabled={watchLoading || !watchEmail}
                    className="px-4 py-2 bg-[#0f1f3d] text-white text-sm font-semibold rounded-lg hover:bg-[#1a3560] disabled:opacity-50 transition-colors"
                  >
                    {watchLoading ? "Adding..." : "Monitor"}
                  </button>
                </div>
                {watchError && (
                  <p className="mt-2 text-xs text-red-600">{watchError}</p>
                )}
              </div>
            ) : (
              <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <svg className="w-5 h-5 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-green-800 font-medium">
                  Monitoring active — we&apos;ll email you if new permits are filed.
                </p>
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500 mb-3">
                Need to check another property?
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0f1f3d] text-white text-sm font-medium rounded-lg hover:bg-[#1a3560] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search Another Address
              </a>
            </div>
          </>
        ) : (
          /* STATE 1: Unpaid — teaser with real status counts + payment CTA */
          <div>
            {/* Locked risk badge — shown in unpaid state to drive conversion */}
            <div className="mb-5 rounded-xl border-2 border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    AI Risk Summary
                  </div>
                  <div className="text-xs text-gray-400">
                    Risk level · Red flags · Due diligence analysis
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-400 bg-gray-200 px-2.5 py-1 rounded-full" title="Unlock to see permit details and AI risk summary">
                Locked
              </span>
            </div>

            {/* Teaser — shows real counts without record details */}
            <PermitTeaser
              permitCount={permitCount}
              statusBreakdown={result.status_breakdown ?? {}}
              hasComplaints={result.has_complaints ?? false}
              hasExpired={result.has_expired ?? false}
              isUnit={result.is_unit ?? false}
            />

            {/* Matter Reference — attorney reports only */}
            {result.report_type === "attorney" && (
              <div className="mt-8 max-w-md mx-auto">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matter Reference <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={matterReference}
                  onChange={(e) => setMatterReference(e.target.value)}
                  placeholder="e.g. Smith v. Jones — File #2024-001"
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  maxLength={100}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Appears on the cover page of your report for case identification
                </p>
              </div>
            )}

            {/* Optional listing description for enhanced AI analysis */}
            <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Enhance your AI analysis{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Paste the property listing description below. Our AI will cross-reference
                the seller&apos;s renovation claims against the official permit records.
              </p>
              <textarea
                value={listingDescription}
                onChange={(e) => setListingDescription(e.target.value)}
                placeholder="Paste the listing description here — e.g. 'Fully renovated 4BR home with new kitchen, bathrooms, and roof. Updated electrical and plumbing throughout...'"
                rows={4}
                maxLength={2000}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-gray-700 placeholder-gray-400"
              />
              {listingDescription.length > 0 && (
                <p className="mt-1 text-xs text-blue-600 font-medium">
                  Listing description will be included in your AI analysis
                </p>
              )}
            </div>

            {/* Payment CTA — sticky on mobile for visibility */}
            <div className="sticky bottom-0 z-20 -mx-4 px-4 py-4 bg-white/95 backdrop-blur-sm border-t border-gray-100 sm:relative sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:border-0 sm:backdrop-blur-none mt-8">
              <div className="text-center">
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full sm:w-auto px-8 py-4 bg-[#0f1f3d] text-white rounded-xl font-bold text-base sm:text-lg hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  {checkoutLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Redirecting to payment...
                    </span>
                  ) : (
                    `Unlock full report for ${result.report_type === "attorney" ? "$199" : "$9.99"}`
                  )}
                </button>
                <p className="mt-2 text-xs text-gray-500">
                  Secure payment via Stripe · Instant access · 30-day money-back guarantee
                </p>
              </div>
            </div>
          </div>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
