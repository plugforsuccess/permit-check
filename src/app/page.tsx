"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AddressAutocomplete, {
  type StructuredAddress,
} from "@/components/AddressAutocomplete";
import Disclaimer from "@/components/Disclaimer";
import { getSupabaseClient } from "@/lib/supabase/client";
import { JURISDICTIONS } from "@/lib/accela/jurisdictions";

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scraperError = searchParams.get("error") === "scraper_unavailable";
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    address: StructuredAddress,
  ) => {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch("/api/lookup/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          address: address.raw,
          report_type: "standard",
          address_components: {
            streetNumber: address.streetNumber,
            streetName: address.streetName,
            city: address.city,
            state: address.state,
            zip: address.zip,
          },
        }),
      });

      const initData = await response.json();

      if (!response.ok) {
        setError(initData.error || "Something went wrong. Please try again.");
        return;
      }

      const lookupId = initData.lookup_id;
      const jurisdictionLabel =
        JURISDICTIONS[initData.jurisdiction_id]?.name ?? "Atlanta Metro";

      // Step 2 — redirect to loading screen immediately
      router.push(
        `/searching/${lookupId}?address=${encodeURIComponent(address.raw)}&jurisdiction=${encodeURIComponent(jurisdictionLabel)}`
      );

      // Step 3 — fire scrape in background (client-side, stays alive)
      // Don't await — searching page polls status
      if (!initData.cached) {
        fetch(`/api/lookup/${lookupId}/scrape`, { method: "POST" })
          .catch(console.error);
      }
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
      {/* Hero — split layout */}
      <section className="pt-16 pb-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">

          {/* Left: CTA */}
          <div>
            <div className="inline-flex flex-wrap items-center gap-2 bg-[#0f1f3d]/5 text-[#0f1f3d] text-sm font-medium px-3 py-1.5 rounded-full mb-6 border border-[#0f1f3d]/10">
              <span className="w-2 h-2 bg-[#c9a84c] rounded-full animate-pulse" />
              Now covering Atlanta Metro + Gwinnett County
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-tight tracking-tight">
              Where Serious Money
              <br />
              <span style={{ color: "#c9a84c" }}>Does Its Homework.</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 leading-relaxed">
              Instant permit intelligence on any property address —
              before you commit capital.
            </p>
            {scraperError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                The permit database is temporarily unavailable. Please try again in a few minutes.
              </div>
            )}
            <AddressAutocomplete onSelect={handleSubmit} isLoading={isLoading} />
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <p className="mt-8 text-sm font-semibold text-[#0f1f3d] text-center lg:text-left">
              The Carfax of real estate investing.
            </p>
          </div>

          {/* Right: Product preview */}
          <div className="hidden lg:block relative">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Mock results header */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="text-sm text-gray-500 mb-1">55 Trinity Ave SW, Atlanta, GA</div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                    10 permit records found
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                    Locked
                  </span>
                </div>
              </div>
              {/* Blurred table preview */}
              <div className="relative">
                <div className="blur-sm select-none p-4">
                  <div className="space-y-2">
                    {["BM-202403948", "BE-202505738", "BP-202502458", "CC-2025-00302", "BT-202501504"].map((rec, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50">
                        <span className="font-mono text-xs text-gray-700 w-32">{rec}</span>
                        <span className="text-xs text-gray-500 flex-1">
                          {["Residential - HVAC", "Residential - Electrical", "Residential - Plumbing", "Code Complaint", "Temporary Power"][i]}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${["bg-green-100 text-green-700", "bg-green-100 text-green-700", "bg-red-100 text-red-700", "bg-blue-100 text-blue-700", "bg-green-100 text-green-700"][i]}`}>
                          {["Issued", "Issued", "Expired", "Finaled", "Issued"][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Lock overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                  <div className="text-center">
                    <div className="text-3xl mb-2">&#128274;</div>
                    <div className="text-sm font-semibold text-gray-700">Unlock for $9.99</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-50 rounded-full -z-10" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-green-50 rounded-full -z-10" />
          </div>

        </div>
      </section>

      {/* Value props */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-lg text-gray-700 leading-relaxed mb-10 max-w-2xl mx-auto">
            Before you commit capital, know exactly what you&apos;re buying.
            PermitCheck surfaces open permits, expired inspections, and
            unpermitted work — instantly.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Instant Results
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Search any property address and get a full permit history in
                seconds, not days.
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Flagged Issues
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Open, expired, and unpermitted work clearly identified. No data
                mining required.
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="text-3xl mb-3">🏆</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Built for Investors
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Designed for the deal-stage workflow of wholesalers, flippers,
                and acquisition teams.
              </p>
            </div>
          </div>
          <p className="mt-10 text-center text-sm text-gray-500 italic">
            Built for the investor who does their homework before every deal.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Pay for What You Need. Nothing More.
          </h2>
          <p className="text-gray-500 mb-10 text-sm">
            Run one deal or a hundred — we have you covered.
          </p>

          {/* Two primary cards */}
          <div className="grid sm:grid-cols-2 gap-6 mb-8">

            {/* Permit Intelligence Report — primary */}
            <div className="border-2 border-gray-200 rounded-2xl p-6 sm:p-8 text-left">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Per Report
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">$9.99</div>
              <div className="text-sm text-gray-500 mb-6">per address · instant results</div>
              <ul className="space-y-3 text-sm text-gray-700">
                <li>✓ Full permit history for one address</li>
                <li>✓ Building, electrical, plumbing, HVAC — all types</li>
                <li>✓ Filed date, status, and description for every record</li>
                <li>✓ AI risk analysis with red flags and seller questions</li>
                <li>✓ Downloadable PDF report</li>
                <li>✓ Official government database</li>
              </ul>
            </div>

            {/* Investor Plan — subscription */}
            <div className="border-2 border-[#c9a84c] rounded-2xl p-6 sm:p-8 text-left relative">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-[#c9a84c] text-[#0f1f3d] text-xs font-bold rounded-full">
                For active investors
              </div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-1">
                Unlimited
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">$99</div>
              <div className="text-sm text-gray-500 mb-6">per month · unlimited searches</div>
              <ul className="space-y-3 text-sm text-gray-700 mb-8">
                <li>✓ Unlimited searches — run every deal</li>
                <li>✓ Full permit history on every address</li>
                <li>✓ AI risk analysis on every search</li>
                <li>✓ Full lookup history and re-downloads</li>
                <li>✓ Cancel anytime</li>
              </ul>
              <a
                href="/subscribe"
                className="block w-full text-center px-5 py-3 bg-[#c9a84c] text-[#0f1f3d] rounded-xl font-bold text-sm hover:bg-[#b8973d] transition-colors active:scale-[0.98]"
              >
                Get unlimited access
              </a>
            </div>

          </div>

          {/* Attorney report — secondary, demoted */}
          <div className="border border-gray-200 rounded-xl px-6 py-5 text-left sm:flex sm:items-start sm:gap-8 bg-gray-50">
            <div className="sm:flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg font-bold text-gray-900">$199</span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Attorney Litigation-Grade Report
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Everything in the standard report plus a formal cover page,
                chain of custody, Report ID for evidentiary use, and matter
                reference field. Suitable for real estate litigation.
              </p>
            </div>
            <div className="mt-4 sm:mt-0 sm:shrink-0">
              <span className="inline-block text-xs text-gray-400 font-medium">
                Selected at checkout →
              </span>
            </div>
          </div>

        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4">
        <Disclaimer />
      </div>
    </div>
  );
}
