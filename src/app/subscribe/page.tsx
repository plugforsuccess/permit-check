"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agentName, setAgentName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    // Try sign up — falls through gracefully if account already exists
    await supabase.auth.signUp({ email, password });

    // Sign in either way
    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.session) {
      setError("Could not sign in. Check your email and password and try again.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/subscription/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        agent_name: agentName || undefined,
        brokerage: brokerage || undefined,
      }),
    });

    const checkoutData = await res.json();
    if (checkoutData.checkout_url) {
      window.location.href = checkoutData.checkout_url;
    } else {
      setError(checkoutData.error ?? "Failed to start checkout");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-gray-50">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <a href="/"><Logo size="lg" /></a>
          <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
            Agent Plan
          </h1>
          <p className="text-gray-500 text-sm">
            $99/month · unlimited searches · your name on every report
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-4">

          <div className="mb-6 p-4 bg-[#0f1f3d]/5 rounded-xl">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <span className="text-[#c9a84c] font-bold">✓</span>
                Unlimited property permit searches
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#c9a84c] font-bold">✓</span>
                Your name and brokerage on every report
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#c9a84c] font-bold">✓</span>
                Full lookup history and report re-downloads
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#c9a84c] font-bold">✓</span>
                AI due diligence analysis on every search
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#c9a84c] font-bold">✓</span>
                Cancel anytime from your dashboard
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your name{" "}
                <span className="text-gray-400 font-normal">
                  (appears on reports)
                </span>
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brokerage{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={brokerage}
                onChange={(e) => setBrokerage(e.target.value)}
                placeholder="Keller Williams Atlanta"
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@kwatlanta.com"
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters"
                minLength={8}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSubscribe}
              disabled={loading || !email || !password}
              className="w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "Setting up your account..."
                : "Continue to payment →"}
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-400 text-center">
            You&apos;ll be taken to Stripe to enter your card details.
            $99/month. Cancel anytime.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400">
          Already subscribed?{" "}
          <a href="/dashboard" className="text-[#0f1f3d] underline">
            Sign in to your dashboard
          </a>
        </p>

      </div>
    </div>
  );
}
