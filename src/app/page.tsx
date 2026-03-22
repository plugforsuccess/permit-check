"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AddressAutocomplete, {
  type StructuredAddress,
} from "@/components/AddressAutocomplete";
import Disclaimer from "@/components/Disclaimer";
import { getSupabaseClient } from "@/lib/supabase/client";
import { JURISDICTIONS } from "@/lib/accela/jurisdictions";
import Logo from "@/components/Logo";

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
    reportType: "standard" | "attorney"
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
          report_type: reportType,
          address_components: {
            streetNumber: address.streetNumber,
            streetName: address.streetName,
            city: address.city,
            state: address.state,
            zip: address.zip,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      const jurisdictionLabel =
        JURISDICTIONS[data.jurisdiction_id]?.name ?? "Atlanta Metro";
      router.push(
        `/searching/${data.lookup_id}?address=${encodeURIComponent(address.raw)}&jurisdiction=${encodeURIComponent(jurisdictionLabel)}`
      );
      setIsLoading(false);
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
      <section className="pt-16 pb-12 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">

          {/* Left: CTA */}
          <div>
            <div className="inline-flex flex-wrap items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Now covering Atlanta Metro + Gwinnett County
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-tight tracking-tight">
              Verify permits before
              <br />
              <span style={{ color: "#c9a84c" }}>you close.</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 leading-relaxed">
              Unpermitted work costs buyers tens of thousands. Search the
              official government permit database for any supported metro area
              property in seconds.
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
            {/* Trust signals */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
              <span>&#10003; Official government data</span>
              <span>&#10003; Results in ~20 seconds</span>
              <span>&#10003; $9.99 one-time</span>
            </div>
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

      {/* Below the fold explainer */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center justify-center gap-2">
            What is <Logo size="lg" showIcon={false} />?
          </h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            PermitCheck searches official government permit databases across
            supported jurisdictions — currently covering Atlanta and Gwinnett
            County, with more coming soon.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            Unpermitted work is one of the most common — and most expensive —
            surprises in real estate transactions. A $50,000 kitchen renovation
            done without permits can cost a new owner tens of thousands to bring
            up to code, or worse, become a liability in a future sale.
          </p>
          <p className="text-gray-600 leading-relaxed">
            For $9.99, you get the full permit history for any supported property
            — searchable in seconds, not days.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-10">Pricing</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Standard */}
            <div className="border-2 border-gray-200 rounded-2xl p-5 sm:p-8 text-left">
              <div className="text-2xl font-bold text-gray-900 mb-1">$9.99</div>
              <div className="text-sm text-gray-500 mb-6">one-time · instant access</div>
              <ul className="space-y-3 text-sm text-gray-700">
                <li>✓ Full permit history for one address</li>
                <li>✓ All permit types — building, electrical, plumbing, HVAC</li>
                <li>✓ Filed date, issued date, status, contractor</li>
                <li>✓ Downloadable PDF report</li>
                <li>✓ Data sourced directly from official government permit databases</li>
              </ul>
            </div>

            {/* Attorney */}
            <div className="border-2 border-[#0f1f3d] rounded-2xl p-5 sm:p-8 text-left relative">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-[#0f1f3d] text-white text-xs font-semibold rounded-full">
                For legal use
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">$199</div>
              <div className="text-sm text-gray-500 mb-6">one-time · litigation-grade</div>
              <ul className="space-y-3 text-sm text-gray-700">
                <li>✓ Everything in Standard</li>
                <li>✓ Formal cover page with chain of custody</li>
                <li>✓ Report ID for evidentiary use</li>
                <li>✓ Suitable for real estate litigation and due diligence</li>
                <li>✓ Matter reference field available</li>
              </ul>
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
