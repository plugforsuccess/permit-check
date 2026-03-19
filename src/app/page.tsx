"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddressSearch from "@/components/AddressSearch";
import Disclaimer from "@/components/Disclaimer";

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async (
    address: string,
    reportType: "standard" | "attorney"
  ) => {
    setIsLoading(true);
    setSearchError(null);

    try {
      const response = await fetch("/api/lookup/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, report_type: reportType }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSearchError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Redirect to Stripe checkout
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        // If no payment URL (e.g., free tier in future), go to results
        router.push(`/results/${data.lookup_id}`);
      }
    } catch {
      setSearchError(
        "Unable to connect to the server. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Verify Atlanta Property Permits
            <br />
            <span className="text-blue-600">Before You Buy</span>
          </h1>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Instantly check the complete permit history for any Atlanta property.
            Protect yourself from unpermitted renovations, illegal additions, and
            seller misrepresentation.
          </p>

          <AddressSearch onSearch={handleSearch} isLoading={isLoading} />

          {searchError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm max-w-2xl mx-auto">
              {searchError}
            </div>
          )}

          <p className="mt-6 text-sm text-gray-400">
            Searching the City of Atlanta&apos;s Accela public records database
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Enter the Address",
                description:
                  "Type any Atlanta property address. We search the City of Atlanta's official permit database.",
              },
              {
                step: "2",
                title: "Unlock the Report",
                description:
                  "See how many permits are on file, then pay $9.99 to unlock the full detailed report.",
              },
              {
                step: "3",
                title: "Download Your PDF",
                description:
                  "Get a professional PDF report suitable for your agent, attorney, or personal records.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="text-center p-6 bg-white rounded-xl shadow-sm"
              >
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
            Pay per lookup or save with a subscription plan.
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                name: "Single Lookup",
                price: "$9.99",
                period: "per report",
                features: [
                  "One property permit report",
                  "Full permit history",
                  "PDF download",
                  "48-hour access",
                ],
                cta: "Get Started",
                highlighted: false,
              },
              {
                name: "Buyer Plan",
                price: "$29",
                period: "/month",
                features: [
                  "10 lookups per month",
                  "Full permit history",
                  "PDF downloads",
                  "Lookup history dashboard",
                ],
                cta: "Subscribe",
                highlighted: true,
              },
              {
                name: "Agent Plan",
                price: "$99",
                period: "/month",
                features: [
                  "Unlimited lookups",
                  "Full permit history",
                  "PDF downloads",
                  "Priority support",
                ],
                cta: "Subscribe",
                highlighted: false,
              },
              {
                name: "Attorney Report",
                price: "$199",
                period: "per report",
                features: [
                  "Litigation-grade PDF",
                  "Chain of custody documentation",
                  "Cover page with matter reference",
                  "Suitable for court filings",
                ],
                cta: "Order Report",
                highlighted: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`p-6 rounded-xl border-2 ${plan.highlighted ? "border-blue-600 shadow-lg scale-105" : "border-gray-200"} bg-white`}
              >
                {plan.highlighted && (
                  <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900">
                  {plan.name}
                </h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="text-sm text-gray-600 flex items-start gap-2"
                    >
                      <svg
                        className="w-4 h-4 text-green-500 mt-0.5 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors ${plan.highlighted ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Why PermitCheck?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Public Record Data",
                description:
                  "We pull directly from the City of Atlanta's official Accela database — the same system used by city inspectors.",
              },
              {
                title: "Instant Results",
                description:
                  "No waiting for manual research. Get your permit history in seconds, not days.",
              },
              {
                title: "Attorney-Ready Reports",
                description:
                  "Our PDF reports are formatted for professional use — suitable for demand letters and legal filings.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4">
        <Disclaimer />
      </div>
    </div>
  );
}
