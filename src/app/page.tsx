"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Disclaimer from "@/components/Disclaimer";

export default function HomePage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = address.trim();
    if (!trimmed) {
      setError("Please enter an address");
      return;
    }
    if (!/^\d+/.test(trimmed)) {
      setError("Address must start with a street number");
      return;
    }
    if (trimmed.split(/\s+/).length < 2) {
      setError("Please enter a complete street address");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/lookup/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      router.push(`/results/${data.lookup_id}`);
    } catch {
      setError(
        "Unable to connect to the server. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Verify Atlanta Property Permits
            <br />
            <span className="text-blue-600">Before You Buy</span>
          </h1>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Instantly check the complete permit history for any Atlanta property.
          </p>

          <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError(null);
                }}
                placeholder="Enter a property address — e.g. 130 Trinity Ave SW"
                className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900 placeholder-gray-400"
                disabled={isLoading}
                aria-label="Property address"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
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
                    Searching...
                  </span>
                ) : (
                  "Check Permits"
                )}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </form>

          <p className="mt-6 text-sm text-gray-400">
            Searching the City of Atlanta&apos;s Accela public records database
          </p>
        </div>
      </section>

      {/* Below the fold explainer */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            What is PermitCheck?
          </h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            PermitCheck searches the City of Atlanta&apos;s official Accela
            database for building permits, renovation permits, and other public
            records tied to a property address. Buyers use it to verify that
            renovations were properly permitted before closing on a home.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            Unpermitted work is one of the most common — and most expensive —
            surprises in real estate transactions. A $50,000 kitchen renovation
            done without permits can cost a new owner tens of thousands to bring
            up to code, or worse, become a liability in a future sale.
          </p>
          <p className="text-gray-600 leading-relaxed">
            For $9.99, you get the full permit history for any Atlanta property
            — searchable in seconds, not days.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4">
        <Disclaimer />
      </div>
    </div>
  );
}
