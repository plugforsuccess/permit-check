"use client";

import { useState } from "react";

interface OnboardingModalProps {
  session: { access_token: string; user: { email?: string } };
  onComplete: (data: OnboardingData) => void;
  onSkip: () => void;
}

interface OnboardingData {
  user_role?: string;
  deal_volume?: string;
}

const ROLES = [
  { value: "investor", label: "Investor", icon: "🏠" },
  { value: "wholesaler", label: "Wholesaler", icon: "🔄" },
  { value: "flipper", label: "Flipper", icon: "🔨" },
  { value: "agent", label: "Agent / Broker", icon: "🤝" },
  { value: "attorney", label: "Attorney", icon: "⚖️" },
  { value: "other", label: "Other", icon: "👤" },
];

const VOLUMES = [
  { value: "1_5", label: "1 – 5", sub: "per month" },
  { value: "6_15", label: "6 – 15", sub: "per month" },
  { value: "16_plus", label: "16+", sub: "per month" },
];

export default function OnboardingModal({
  session,
  onComplete,
  onSkip,
}: OnboardingModalProps) {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedVolume, setSelectedVolume] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/user/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_role: selectedRole || undefined,
          deal_volume: selectedVolume || undefined,
        }),
      });
      onComplete({
        user_role: selectedRole,
        deal_volume: selectedVolume,
      });
    } catch {
      // Non-critical — dismiss even on failure
      onSkip();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    // Mark onboarding complete even if skipped
    try {
      await fetch("/api/user/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
    } catch {
      // ignore
    }
    onSkip();
  };

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Tell us about your deal flow
              </h2>
              <p className="text-sm text-gray-500">
                Helps us tailor your reports to how you work.
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-4 mt-1 shrink-0"
            >
              Skip
            </button>
          </div>
        </div>

        {/* Step — Role + Volume */}
        <div className="px-8 py-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            I primarily work as a
          </p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {ROLES.map((role) => (
              <button
                key={role.value}
                onClick={() => setSelectedRole(
                  selectedRole === role.value ? "" : role.value
                )}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                  selectedRole === role.value
                    ? "border-[#0f1f3d] bg-[#0f1f3d]/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-xl">{role.icon}</span>
                <span className="text-xs font-semibold text-gray-700 leading-tight">
                  {role.label}
                </span>
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Properties I evaluate per month
          </p>
          <div className="grid grid-cols-3 gap-2">
            {VOLUMES.map((vol) => (
              <button
                key={vol.value}
                onClick={() => setSelectedVolume(
                  selectedVolume === vol.value ? "" : vol.value
                )}
                className={`flex flex-col items-center gap-0.5 py-3 px-2 rounded-xl border-2 transition-all ${
                  selectedVolume === vol.value
                    ? "border-[#0f1f3d] bg-[#0f1f3d]/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-base font-bold text-gray-900">
                  {vol.label}
                </span>
                <span className="text-xs text-gray-400">{vol.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 bg-[#c9a84c] text-[#0f1f3d] rounded-xl font-bold text-sm hover:bg-[#b8973d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
          >
            {submitting ? "Saving..." : "Get started →"}
          </button>
        </div>

      </div>
    </div>
  );
}
