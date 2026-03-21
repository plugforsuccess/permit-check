"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

interface Step {
  id: string;
  label: string;
  sublabel: string;
  doneAfterMs: number;
}

const STEPS: Step[] = [
  {
    id: "verified",
    label: "Address verified",
    sublabel: "",
    doneAfterMs: 500,
  },
  {
    id: "connected",
    label: "Connected to permit database",
    sublabel: "",
    doneAfterMs: 3000,
  },
  {
    id: "searching",
    label: "Searching permit records",
    sublabel: "Scanning records since 2000...",
    doneAfterMs: Infinity,
  },
  {
    id: "preparing",
    label: "Preparing your report",
    sublabel: "Almost there",
    doneAfterMs: Infinity,
  },
];

type StepStatus = "pending" | "active" | "done";

export default function SearchingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lookupId = params.id as string;
  const address = searchParams.get("address") ?? "";
  const jurisdiction = searchParams.get("jurisdiction") ?? "the permit database";

  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({
    verified: "pending",
    connected: "pending",
    searching: "pending",
    preparing: "pending",
  });

  const redirecting = useRef(false);

  // Animate the timed steps
  useEffect(() => {
    setStepStatuses((s) => ({ ...s, verified: "active" }));
    setTimeout(() => {
      setStepStatuses((s) => ({ ...s, verified: "done", connected: "active" }));
    }, 500);
    setTimeout(() => {
      setStepStatuses((s) => ({ ...s, connected: "done", searching: "active" }));
    }, 3000);
  }, []);

  // Poll the status endpoint with exponential backoff
  useEffect(() => {
    if (!lookupId) return;

    let timeoutId: NodeJS.Timeout | null = null;
    let attempt = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/lookup/${lookupId}/status`);

        if (res.status === 503) {
          router.push(`/?error=scraper_unavailable`);
          return;
        }

        if (!res.ok) {
          scheduleNext();
          return;
        }

        const data = await res.json();

        if (data.lookup_id && !redirecting.current) {
          redirecting.current = true;

          setStepStatuses((s) => ({
            ...s,
            searching: "done",
            preparing: "active",
          }));

          setTimeout(() => {
            setStepStatuses((s) => ({ ...s, preparing: "done" }));
            setTimeout(() => {
              router.push(`/results/${lookupId}`);
            }, 400);
          }, 800);
          return;
        }
      } catch {
        // ignore poll errors
      }
      scheduleNext();
    };

    const scheduleNext = () => {
      attempt++;
      // Backoff: 2s, 3s, 4s, 5s, then cap at 5s
      const delay = Math.min(2000 + attempt * 1000, 5000);
      timeoutId = setTimeout(poll, delay);
    };

    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [lookupId, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-16">

      {/* Brand */}
      <Logo size="md" variant="light" className="mb-1" />
      <div className="text-sm text-gray-400 mb-12">Property Permit Verification</div>

      {/* Address pill */}
      {address && (
        <div className="bg-[#0f1f3d]/5 border border-[#0f1f3d]/20 rounded-xl px-4 py-3 mb-8 sm:mb-10 flex items-start gap-2 max-w-sm w-full">
          <svg className="w-4 h-4 text-[#0f1f3d] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-[#0f1f3d] break-words">{address}</span>
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-4 w-full max-w-sm mb-12" aria-live="polite" role="status">
        {STEPS.map((step, i) => {
          const status = stepStatuses[step.id];
          const sublabel =
            step.id === "verified"
              ? `${jurisdiction}${address.match(/\d{5}/) ? ` · ${address.match(/\d{5}/)?.[0]}` : ""}`
              : step.id === "connected"
              ? `${jurisdiction} permit system`
              : step.sublabel;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3.5 transition-opacity duration-500 ${
                status === "pending" ? "opacity-30" : "opacity-100"
              }`}
            >
              {/* Icon */}
              <div className="shrink-0">
                {status === "done" ? (
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : status === "active" ? (
                  <div className="w-7 h-7 rounded-full bg-[#0f1f3d]/10 border-2 border-[#0f1f3d]/30 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-[#0f1f3d] animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center">
                    {i === 3 ? (
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                    )}
                  </div>
                )}
              </div>

              {/* Labels */}
              <div>
                <div className="text-sm font-medium text-gray-900">{step.label}</div>
                {sublabel && (
                  <div className={`text-xs text-gray-500 ${status === "active" && step.id === "searching" ? "animate-pulse" : ""}`}>
                    {sublabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 text-center max-w-xs sm:max-w-sm leading-relaxed">
        This usually takes 15–20 seconds. We&apos;re searching the official
        government permit database on your behalf.
      </p>

    </div>
  );
}
