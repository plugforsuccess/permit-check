"use client";

import { useEffect, useState } from "react";
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

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const lookupId = params.id as string;
  const paymentSuccess = searchParams.get("payment") === "success";

  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
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
    };

    fetchResults();

    // If payment just completed, poll for a few seconds (webhook may be processing)
    if (paymentSuccess) {
      const interval = setInterval(fetchResults, 2000);
      const timeout = setTimeout(() => clearInterval(interval), 10000);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [lookupId, paymentSuccess]);

  if (loading) {
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
          <p className="text-gray-600">Loading permit results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
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

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Payment Success Banner */}
        {paymentSuccess && isPaid && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <svg
              className="w-6 h-6 text-green-600"
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
          <div className="mt-3 flex items-center gap-4">
            <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
              {result.permit_count ?? 0} records found
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                isPaid
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {isPaid ? "Unlocked" : "Locked"}
            </span>
          </div>
        </div>

        {/* Download Button (paid only) */}
        {isPaid && result.report && (
          <div className="mb-6 flex items-center gap-4">
            <a
              href={result.report.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
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
            <span className="text-sm text-gray-500">
              Available until{" "}
              {new Date(result.report.expires_at).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Permit Results */}
        {isPaid && result.permits ? (
          <PermitTable permits={result.permits} />
        ) : (
          <div>
            {/* Show blurred teaser */}
            <PermitTable
              permits={
                // Generate placeholder data for teaser
                Array.from({ length: Math.min(result.permit_count ?? 3, 5) }, (_, i) => ({
                  id: `placeholder-${i}`,
                  lookup_id: lookupId,
                  record_number: "BLD-XXXX-XXXXX",
                  type: "Building Permit",
                  status: "Issued" as const,
                  filed_date: "XXXX-XX-XX",
                  issued_date: "XXXX-XX-XX",
                  description: "Permit details hidden until payment",
                  contractor: "XXXXXXXXXX",
                }))
              }
              isBlurred={true}
            />

            {/* Payment CTA */}
            <div className="mt-8 text-center">
              <a
                href="/"
                className="inline-block px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg"
              >
                Unlock Report for $9.99
              </a>
              <p className="mt-3 text-sm text-gray-500">
                Secure payment via Stripe. Results available instantly.
              </p>
            </div>
          </div>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
