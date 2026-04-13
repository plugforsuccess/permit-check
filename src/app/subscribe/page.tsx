"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { hasAgentAccess } from "@/lib/subscription";
import Logo from "@/components/Logo";

export default function SubscribePage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Profile state
  const [investorName, setInvestorName] = useState("");
  const [company, setCompany] = useState("");
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  // Checkout state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check existing session on mount
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);

        // Check if already subscribed
        const { data } = await supabase
          .from("users")
          .select("subscription_status, agent_name, brokerage")
          .eq("id", session.user.id)
          .single();

        const profile = data as {
          subscription_status: string | null;
          agent_name: string | null;
          brokerage: string | null;
        } | null;

        if (profile) {
          if (hasAgentAccess(profile.subscription_status)) {
            setAlreadySubscribed(true);
          }
          if (profile.agent_name) setInvestorName(profile.agent_name);
          if (profile.brokerage) setCompany(profile.brokerage);
        }
      }
      setAuthLoading(false);
    });
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);

    try {
      const supabase = getSupabaseClient();

      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setAuthError(error.message);
          setAuthBusy(false);
          return;
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message);
        setAuthBusy(false);
        return;
      }

      setIsAuthenticated(true);
    } catch {
      setAuthError("Authentication failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setSubmitError("Session expired. Please sign in again.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/subscription/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agent_name: investorName.trim() || undefined,
          brokerage: company.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Failed to start subscription.");
        setSubmitting(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url;
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // Loading skeleton
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0f1f3d] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already subscribed state
  if (alreadySubscribed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            You&apos;re already subscribed
          </h1>
          <p className="text-gray-500 mb-6">
            Your Investor Plan is active. Run unlimited searches from your
            dashboard.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-6 py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] transition-colors"
          >
            Go to dashboard →
          </a>
        </div>
      </div>
    );
  }

  // Auth gate — not signed in
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gray-50">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <Logo size="md" variant="light" className="inline-block mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">
              {authMode === "register"
                ? "Create your account"
                : "Sign in to subscribe"}
            </h1>
            <p className="text-gray-500 mt-2 text-sm">
              {authMode === "register"
                ? "You need an account to manage your Investor Plan subscription."
                : "Sign in to continue to the Investor Plan."}
            </p>
          </div>

          <form
            onSubmit={handleAuth}
            className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200"
          >
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
                required
                minLength={8}
                autoComplete={
                  authMode === "register" ? "new-password" : "current-password"
                }
              />
              {password.length > 0 && password.length < 8 && (
                <p className="mt-1 text-xs text-amber-600">
                  Password must be at least 8 characters
                </p>
              )}
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy || !email || password.length < 8}
              className="w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {authBusy
                ? "Please wait..."
                : authMode === "register"
                ? "Create account →"
                : "Sign in →"}
            </button>

            <p className="mt-4 text-center text-sm text-gray-500">
              {authMode === "register"
                ? "Already have an account?"
                : "Need an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "register" ? "login" : "register");
                  setAuthError(null);
                }}
                className="text-[#0f1f3d] font-semibold hover:underline"
              >
                {authMode === "register" ? "Sign in" : "Create one"}
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }

  // Authenticated — show subscription form
  return (
    <div className="min-h-screen py-12 px-4 bg-gray-50">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#c9a84c]/10 text-[#0f1f3d] text-sm font-semibold px-3 py-1.5 rounded-full mb-4 border border-[#c9a84c]/20">
            Investor Plan
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Unlimited searches.
            <br />
            <span style={{ color: "#c9a84c" }}>Every deal.</span>
          </h1>
          <p className="text-gray-500">
            $99/month · cancel anytime
          </p>
        </div>

        {/* What you get */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            What&apos;s included
          </p>
          <ul className="space-y-3">
            {[
              "Unlimited permit searches — run every deal",
              "Full permit history on every address",
              "AI risk analysis with red flags and seller questions",
              "Downloadable PDF report on every search",
              "Your name on every report",
              "Full lookup history and re-downloads",
              "Official government database",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="text-[#c9a84c] font-bold shrink-0 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Subscription form */}
        <form
          onSubmit={handleSubscribe}
          className="bg-white border border-gray-200 rounded-2xl p-6"
        >
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Your details
          </p>

          <div className="mb-4">
            <label
              htmlFor="investorName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Your name{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="investorName"
              type="text"
              value={investorName}
              onChange={(e) => setInvestorName(e.target.value)}
              placeholder="e.g. Cameron Wiley"
              maxLength={100}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Appears on your reports
            </p>
          </div>

          <div className="mb-6">
            <label
              htmlFor="company"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Company or firm{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Wiley Acquisitions LLC"
              maxLength={100}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Appears on your reports alongside your name
            </p>
          </div>

          {submitError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-[#c9a84c] text-[#0f1f3d] rounded-xl font-bold text-base hover:bg-[#b8973d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] shadow-sm"
          >
            {submitting
              ? "Redirecting to payment..."
              : "Subscribe for $99/month →"}
          </button>

          <p className="mt-3 text-xs text-gray-400 text-center">
            Secure payment via Stripe · Cancel anytime from your dashboard
          </p>
        </form>

        {/* Back link */}
        <p className="text-center mt-6">
          <a
            href="/#pricing"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to pricing
          </a>
        </p>

      </div>
    </div>
  );
}
