"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PermitTable from "@/components/PermitTable";
import PropertyStreetView from "@/components/PropertyStreetView";
import Disclaimer from "@/components/Disclaimer";
import type { Permit } from "@/types";

interface LookupResult {
  lookup_id: string;
  address: string;
  address_normalized: string;
  permit_count: number;
  payment_status: "pending" | "paid" | "failed";
  report_type: "standard" | "attorney";
  permits: Permit[] | null;
  report: {
    id: string;
    download_url: string;
    expires_at: string;
    summary?: {
      riskLevel: "low" | "medium" | "high";
      summary: string;
      flags: string[];
      positives: string[];
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-[#0f1f3d] text-white rounded-lg font-semibold hover:bg-[#1a3560] transition-colors"
          >
            Try Another Address
          </a>
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

            {/* AI Permit Summary */}
            {result.report?.summary && (
              <div className={`mb-6 rounded-xl border-2 p-5 ${
                result.report.summary.riskLevel === "high"
                  ? "border-red-200 bg-red-50"
                  : result.report.summary.riskLevel === "medium"
                  ? "border-yellow-200 bg-yellow-50"
                  : "border-green-200 bg-green-50"
              }`}>
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
                  <span className="text-xs text-gray-500 font-medium">AI-Generated Summary</span>
                </div>

                <p className={`text-sm leading-relaxed mb-4 font-medium ${
                  result.report.summary.riskLevel === "high"
                    ? "text-red-900"
                    : result.report.summary.riskLevel === "medium"
                    ? "text-yellow-900"
                    : "text-green-900"
                }`}>
                  {result.report.summary.summary}
                </p>

                {result.report.summary.flags.length > 0 && (
                  <div className="mb-3">
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

                {result.report.summary.positives.length > 0 && (
                  <div>
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

                <div className="mt-4 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-400">
                    AI analysis based on official permit records. Not a substitute for
                    professional inspection or legal advice.
                  </p>
                </div>
              </div>
            )}

            <PermitTable permits={result.permits} />

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
          /* STATE 1: Unpaid — blurred teaser + payment CTA */
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
              <span className="text-xs font-semibold text-gray-400 bg-gray-200 px-2.5 py-1 rounded-full">
                Locked
              </span>
            </div>

            <PermitTable
              permits={Array.from(
                { length: Math.max(Math.min(permitCount, 5), 3) },
                (_, i) => ({
                  id: `placeholder-${i}`,
                  lookup_id: lookupId,
                  record_number: "BLD-XXXX-XXXXX",
                  type: "Building Permit",
                  status: "Issued" as const,
                  filed_date: "XXXX-XX-XX",
                  issued_date: "XXXX-XX-XX",
                  description: "Permit details hidden until payment",
                  contractor: "XXXXXXXXXX",
                })
              )}
              isBlurred={true}
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

            {/* Payment CTA */}
            <div className="mt-8 text-center">
              <div className="inline-flex flex-col items-center">
                <svg
                  className="w-10 h-10 text-yellow-500 mb-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full sm:w-auto px-8 py-4 bg-[#0f1f3d] text-white rounded-xl font-bold text-base sm:text-lg hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  {checkoutLoading ? (
                    <span className="flex items-center gap-2">
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
                    "Unlock full report for $9.99"
                  )}
                </button>
                <p className="mt-3 text-sm text-gray-500">
                  Secure payment via Stripe. Results available instantly.
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
