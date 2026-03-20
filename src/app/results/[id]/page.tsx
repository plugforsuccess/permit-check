"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PermitTable from "@/components/PermitTable";
import Disclaimer from "@/components/Disclaimer";
import type { Permit } from "@/types";

interface LookupResult {
  lookup_id: string;
  address: string;
  permit_count: number;
  payment_status: "pending" | "paid" | "failed";
  permits: Permit[] | null;
  report: {
    id: string;
    download_url: string;
    expires_at: string;
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

  // Poll the status endpoint after payment redirect
  useEffect(() => {
    if (!paymentSuccess) return;

    setPollingForPayment(true);
    let attempts = 0;
    const maxAttempts = 5;

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
      }
    };

    // Poll every 2 seconds for up to 10 seconds
    const interval = setInterval(poll, 2000);
    // Also do an immediate check
    poll();

    return () => clearInterval(interval);
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
        body: JSON.stringify({ lookup_id: lookupId }),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4"
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
          <p className="text-gray-600">
            {pollingForPayment
              ? "Confirming your payment..."
              : "Loading permit results..."}
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
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
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
  const isZeroResults = permitCount === 0;

  // Zero-result state — no payment gate
  if (isZeroResults) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Permit History
            </h1>
            <p className="text-lg text-gray-600">{result.address}</p>
          </div>

          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <div className="text-5xl mb-4">
              <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-3">
              No Permit Records Found
            </h3>
            <p className="text-gray-500 max-w-lg mx-auto leading-relaxed">
              No permit records found in the City of Atlanta database for this
              address. This may indicate no permitted work has been recorded, or
              the address format may need adjustment.
            </p>
            <a
              href="/"
              className="inline-block mt-8 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Search Another Address
            </a>
          </div>

          <Disclaimer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
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

        {/* Address Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Permit History
          </h1>
          <p className="text-lg text-gray-600">{result.address}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
              {permitCount} permit record{permitCount !== 1 ? "s" : ""} found
            </span>
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
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <button
                disabled
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-300 text-gray-500 rounded-lg font-semibold cursor-not-allowed"
                title="Coming soon"
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
              <span className="text-sm text-gray-500">Coming soon</span>
            </div>

            <PermitTable permits={result.permits} />
          </>
        ) : (
          /* STATE 1: Unpaid — blurred teaser + payment CTA */
          <div>
            <PermitTable
              permits={Array.from(
                { length: Math.min(permitCount, 5) },
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
                  className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
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
