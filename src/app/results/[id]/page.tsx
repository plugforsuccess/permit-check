"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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
  used_fuzzy_match?: boolean;
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
  const router = useRouter();
  const lookupId = params.id as string;
  const paymentSuccess = searchParams.get("payment") === "success";

  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pollingForPayment, setPollingForPayment] = useState(false);
  const [matterReference, setMatterReference] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [watchEmail, setWatchEmail] = useState("");
  const [watchAdded, setWatchAdded] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<1 | -1 | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState(false);
  const [listingText, setListingText] = useState("");
  const [listingAnalyzing, setListingAnalyzing] = useState(false);
  const [listingAnalyzed, setListingAnalyzed] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [showListingModal, setShowListingModal] = useState(false);

  const handleFeedback = async (rating: 1 | -1) => {
    if (feedbackSubmitted) return;
    setFeedbackRating(rating);

    try {
      const res = await fetch(`/api/report/${lookupId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setFeedbackSubmitted(true);
      } else {
        // Reset so user can retry
        setFeedbackRating(null);
      }
    } catch {
      // Network error — reset so user can retry
      setFeedbackRating(null);
    }
  };

  const handleAnalyzeListing = async () => {
    if (!listingText.trim() || listingAnalyzing) return;
    setListingAnalyzing(true);
    setListingError(null);

    try {
      const res = await fetch(`/api/lookup/${lookupId}/analyze-listing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_description: listingText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setListingError(data.error || "Analysis failed. Please try again.");
        return;
      }

      // Refresh the results to show new summary
      setListingAnalyzed(true);
      await fetchResults();
    } catch {
      setListingError("Unable to connect. Please try again.");
    } finally {
      setListingAnalyzing(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);

    try {
      const res = await fetch(`/api/lookup/${lookupId}/refresh`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setRefreshError(data?.error ?? "Unable to refresh. Please try again.");
        setTimeout(() => setRefreshError(null), 5000);
        setRefreshing(false);
        return;
      }

      // Fire scrape in background (mirrors normal flow from home page)
      fetch(`/api/lookup/${lookupId}/scrape`, { method: "POST" }).catch(
        () => {}
      );

      // Redirect to searching page to show progress
      router.push(
        `/searching/${lookupId}?address=${encodeURIComponent(
          result?.address_normalized ?? ""
        )}&refresh=true`
      );
    } catch {
      setRefreshing(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setListingText(text.slice(0, 2000));
    } catch {
      setClipboardError(true);
      setTimeout(() => setClipboardError(false), 3000);
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

        // Use native share sheet on mobile (iOS Safari, Android Chrome)
        // Falls back to clipboard copy on desktop
        if (navigator.share) {
          try {
            await navigator.share({
              title: "PermitCheck Report",
              text: `Permit history for ${result?.address_normalized ?? "this property"} — verified via official government records.`,
              url: data.share_url,
            });
            // Native share sheet handled — no need to show the URL input
            return;
          } catch (err) {
            // User dismissed the share sheet (AbortError) — fall through to clipboard
            // Any other error — fall through to clipboard
            if ((err as Error).name === "AbortError") {
              // User cancelled — do nothing, don't show clipboard fallback
              return;
            }
          }
        }

        // Desktop fallback — clipboard copy + show URL input
        try {
          await navigator.clipboard.writeText(data.share_url);
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 3000);
        } catch {
          // Clipboard unavailable — URL is shown via shareUrl state below
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

    // Scroll to top so user sees the payment confirmation banner
    window.scrollTo({ top: 0, behavior: "smooth" });

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

  // Auto-trigger summary generation if report exists but has no summary
  const regenerateTriggered = useRef(false);

  useEffect(() => {
    if (!result) return;
    if (result.payment_status !== "paid") return;
    if (!result.permits) return;
    const reportComplete = result.report?.summary || result.report?.risk_level;
    if (reportComplete) return;
    if (regenerateTriggered.current) return;

    regenerateTriggered.current = true;
    setListingAnalyzing(true);

    (async () => {
      try {
        const res = await fetch(`/api/lookup/${lookupId}/regenerate`, {
          method: "POST",
        });
        if (res.ok) {
          await fetchResults();
        }
      } catch {
        // silent fail — user can use analyze-listing button manually
      } finally {
        setListingAnalyzing(false);
      }
    })();
  }, [result, lookupId, fetchResults]);

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
          listing_description: listingText || undefined,
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
          <div className="h-44 sm:h-56 rounded-2xl overflow-hidden">
            <PropertyStreetView address={result.address_normalized || result.address} />
          </div>
        </div>

        {/* Address Header */}
        <div className="mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1">
            Permit Intelligence
          </h1>
          <p className="text-sm sm:text-base text-gray-600 truncate sm:whitespace-normal">
            {result.address}
          </p>
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
            {result.report && (result.report.summary || result.report.risk_level) ? (
              <div className="mb-6 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3">
                {/* Download — spans full width on mobile */}
                <button
                  onClick={() => {
                    if (listingAnalyzed || (result.report?.summary?.listingNotes?.length ?? 0) > 0) {
                      window.open(result.report!.download_url, "_blank", "noopener,noreferrer");
                    } else {
                      setShowListingModal(true);
                    }
                  }}
                  className="col-span-2 sm:col-span-1 sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0f1f3d] text-white text-sm font-medium rounded-xl hover:bg-[#1a3560] transition-colors active:scale-[0.98]"
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
                </button>
                {/* Share */}
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  className="sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-[#0f1f3d] text-sm font-medium rounded-xl border border-[#0f1f3d] hover:bg-gray-50 transition-colors disabled:opacity-50 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  {shareCopied ? "Link copied!" : shareLoading ? "Generating..." : "Share Report"}
                </button>
                {/* Refresh — smaller, secondary */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-gray-500 text-xs font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? "Refreshing..." : "Refresh Data"}
                </button>
                {refreshError && (
                  <span className="text-xs text-red-600">{refreshError}</span>
                )}
                {shareUrl && !shareCopied && (
                  <div className="w-full sm:w-auto flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 font-mono underline truncate flex-1 min-w-0"
                    >
                      {shareUrl}
                    </a>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          setShareCopied(true);
                          setTimeout(() => setShareCopied(false), 3000);
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 shrink-0 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ) : listingAnalyzing ? (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                <svg
                  className="animate-spin h-5 w-5 text-blue-600 shrink-0"
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
                <p className="text-blue-800 text-sm">
                  Analyzing listing against permit records…
                </p>
              </div>
            ) : null}

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

            {/* Fuzzy match notice */}
            {isPaid && result.used_fuzzy_match && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-800">
                  Permits found via approximate address matching. The official database
                  may store this address in a slightly different format.
                </p>
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
              <div className={`mb-6 rounded-2xl overflow-hidden border ${
                result.report.summary.riskLevel === "high"
                  ? "border-red-200 shadow-lg shadow-red-100"
                  : result.report.summary.riskLevel === "medium"
                  ? "border-amber-200 shadow-lg shadow-amber-100"
                  : "border-emerald-200 shadow-lg shadow-emerald-100"
              }`}>

                {/* Colored header bar */}
                <div className={`px-5 py-3 flex items-center justify-between ${
                  result.report.summary.riskLevel === "high"
                    ? "bg-red-600"
                    : result.report.summary.riskLevel === "medium"
                    ? "bg-amber-500"
                    : "bg-emerald-600"
                }`}>
                  <div className="flex items-center gap-2.5">
                    {result.report.summary.riskLevel === "high" && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                    )}
                    {result.report.summary.riskLevel === "medium" && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                      </svg>
                    )}
                    {result.report.summary.riskLevel === "low" && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                    )}
                    <span className="text-sm font-bold text-white uppercase tracking-wide">
                      {result.report.summary.riskLevel === "high" ? "High Risk"
                        : result.report.summary.riskLevel === "medium" ? "Medium Risk"
                        : "Low Risk"}
                    </span>
                  </div>
                  <span className="text-xs text-white/70 font-medium">AI Risk Analysis</span>
                </div>

                {/* Card body */}
                <div className={`p-5 ${
                  result.report.summary.riskLevel === "high"
                    ? "bg-red-50"
                    : result.report.summary.riskLevel === "medium"
                    ? "bg-amber-50"
                    : "bg-emerald-50"
                }`}>

                {/* Verdict — bold, direct */}
                <p className={`text-base font-bold leading-snug mb-3 ${
                  result.report.summary.riskLevel === "high" ? "text-red-900"
                    : result.report.summary.riskLevel === "medium" ? "text-amber-900"
                    : "text-emerald-900"
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
                      Listing Claims vs. Permit Records
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
                      Questions to put to the seller
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

                <div className="mt-4 pt-3 border-t border-gray-200">
                  {/* Inline listing prompt — only when no listing analysis done yet */}
                  {result.report.summary.listingNotes.length === 0 && !listingAnalyzed && (
                    <div className="mb-3">
                      <button
                        onClick={() => {
                          document
                            .getElementById("listing-panel")
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors py-2 -my-2"
                      >
                        Have the listing? Cross-reference renovation claims against permits →
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
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
                        className={`p-2.5 rounded-lg transition-colors ${
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
                        className={`p-2.5 rounded-lg transition-colors ${
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

            {/* Listing Cross-Reference — shown on paid results */}
            {isPaid && !listingAnalyzed && (
              <div id="listing-panel" className="mb-8 border border-blue-100 bg-blue-50 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Cross-reference the listing
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Paste the listing description. Our AI will flag every renovation
                      claim that has no supporting permit on file.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end mb-1">
                  <button
                    onClick={handlePasteFromClipboard}
                    className="flex items-center gap-1.5 text-xs text-[#0f1f3d] font-medium hover:underline"
                    type="button"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {clipboardError ? "Clipboard access denied" : "Paste from clipboard"}
                  </button>
                </div>

                <textarea
                  value={listingText}
                  onChange={(e) => setListingText(e.target.value)}
                  placeholder="Paste listing description — e.g. 'Fully renovated 4BR with new kitchen, updated electrical, new roof...'"
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2.5 text-sm border border-blue-200 bg-white rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-none text-gray-700 placeholder-gray-400 mb-3"
                />

                {listingError && (
                  <p className="text-xs text-red-600 mb-3">{listingError}</p>
                )}

                <button
                  onClick={handleAnalyzeListing}
                  disabled={!listingText.trim() || listingAnalyzing}
                  className="px-4 py-2 bg-[#0f1f3d] text-white text-sm font-semibold rounded-lg hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 active:scale-[0.98]"
                >
                  {listingAnalyzing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analyzing listing...
                    </>
                  ) : (
                    "Analyze Listing"
                  )}
                </button>
              </div>
            )}

            {/* Show confirmation after analysis completes */}
            {isPaid && listingAnalyzed && (
              <div className="mb-8 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                AI analysis updated with listing cross-reference
              </div>
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
                      Track this address
                    </div>
                    <p className="text-xs text-gray-500">
                      Get notified if new permits are filed at this address over the
                      next 30 days — useful if you&apos;re under contract or running
                      multiple deals simultaneously.
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

            {showListingModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => setShowListingModal(false)}
                />
                <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 z-10">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 text-center mb-2">
                    Add listing to your report?
                  </h3>
                  <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                    Cross-referencing the property listing flags renovation claims
                    that have no permits on file. Takes 5–8 seconds.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setShowListingModal(false);
                        setTimeout(() => {
                          document
                            .getElementById("listing-panel")
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 100);
                      }}
                      className="w-full px-4 py-3 bg-[#0f1f3d] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3560] transition-colors"
                    >
                      Add listing first
                    </button>
                    <button
                      onClick={() => {
                        setShowListingModal(false);
                        window.open(result.report!.download_url, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full px-4 py-3 bg-gray-50 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      Skip — download now
                    </button>
                  </div>
                </div>
              </div>
            )}
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
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-800">
                  Add the listing for deeper analysis{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <button
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1.5 text-xs text-[#0f1f3d] font-medium hover:underline"
                  type="button"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {clipboardError ? "Clipboard access denied" : "Paste from clipboard"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Paste the listing description. Our AI will cross-reference every
                renovation claim against the official permit records before you
                commit capital.
              </p>
              <textarea
                value={listingText}
                onChange={(e) => setListingText(e.target.value)}
                placeholder="Paste the listing description here — e.g. 'Fully renovated 4BR home with new kitchen, bathrooms, and roof. Updated electrical and plumbing throughout...'"
                rows={4}
                maxLength={2000}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none text-gray-700 placeholder-gray-400"
              />
              {listingText.length > 0 && (
                <p className="mt-1 text-xs text-blue-600 font-medium">
                  Listing description will be included in your AI analysis
                </p>
              )}
            </div>

            {/* Payment CTA — sticky on mobile for visibility */}
            <div className="sticky bottom-0 z-20 -mx-4 px-4 py-4 bg-white/98 backdrop-blur-lg border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] sm:relative sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:border-0 sm:shadow-none sm:backdrop-blur-none mt-8">
              <div className="text-center">
                {permitCount > 0 && (
                  <p className="text-xs text-center text-gray-500 mb-2 sm:hidden">
                    {permitCount} permit record{permitCount !== 1 ? "s" : ""} found · unlock to see all
                  </p>
                )}
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="btn-shimmer w-full sm:w-auto px-8 py-4 text-white rounded-xl font-bold text-base sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg active:scale-[0.98]"
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
