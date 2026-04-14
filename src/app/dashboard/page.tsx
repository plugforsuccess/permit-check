"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import Disclaimer from "@/components/Disclaimer";
import Logo from "@/components/Logo";
import {
  hasAgentAccess,
  getSubscriptionMessage,
  getSubscriptionCTA,
} from "@/lib/subscription";

interface LookupHistory {
  id: string;
  address_raw: string;
  address_normalized: string;
  created_at: string;
  payment_status: string;
  permit_count: number;
  report_type: string;
  reports: Array<{
    id: string;
    pdf_url: string;
    expires_at: string;
    risk_level: string | null;
  }>;
}

export default function DashboardPage() {
  const [lookups, setLookups] = useState<LookupHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    new Set()
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [userProfile, setUserProfile] = useState<{
    agent_name: string | null;
    brokerage: string | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
  } | null>(null);
  const [session, setSession] = useState<{ user: { id: string; email?: string }; access_token: string } | null>(null);

  const toggleCompare = (lookupId: string) => {
    setSelectedForCompare((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(lookupId)) {
        next.delete(lookupId);
      } else if (next.size < 4) {
        next.add(lookupId);
      }
      return next;
    });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      const supabase = getSupabaseClient();

      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        // Registration succeeded — show confirmation state
        // Do NOT attempt sign-in — Supabase requires email confirmation first
        setRegisteredEmail(email);
        setAwaitingConfirmation(true);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Provide a clearer message than Supabase's default
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setAuthError(
            "Please confirm your email before signing in. Check your inbox for a confirmation link."
          );
        } else if (error.message.toLowerCase().includes("invalid login")) {
          setAuthError("Incorrect email or password. Please try again.");
        } else {
          setAuthError(error.message);
        }
        return;
      }

      setIsAuthenticated(true);
      setSession(data.session);
      fetchHistory(data.session.access_token);
      fetchProfile(data.session.user.id);
    } catch {
      setAuthError("Authentication failed. Please try again.");
    }
  };

  const fetchHistory = async (token: string) => {
    try {
      const response = await fetch("/api/user/history", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLookups(data.lookups);
      }
    } catch {
      console.error("Failed to fetch history");
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    const supabase = getSupabaseClient();
    const { data: profile } = await supabase
      .from("users")
      .select("agent_name, brokerage, subscription_status, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profile) setUserProfile(profile);
  };

  const handleManageSubscription = async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) return;

    const res = await fetch("/api/subscription/portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    });
    const data = await res.json();
    if (data.portal_url) window.location.href = data.portal_url;
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setIsAuthenticated(true);
        setSession(s);
        fetchHistory(s.access_token);
        fetchProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  if (!isAuthenticated) {

    // Email confirmation pending state
    if (awaitingConfirmation) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
          <div className="max-w-md w-full text-center">
            <a href="/" className="inline-block mb-6">
              <Logo size="lg" variant="light" />
            </a>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="w-14 h-14 bg-[#0f1f3d]/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[#0f1f3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Check your email
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                We sent a confirmation link to
              </p>
              <p className="text-sm font-semibold text-[#0f1f3d] mb-6">
                {registeredEmail}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Click the link in the email to activate your account.
                Then come back here to sign in.
              </p>

              <button
                onClick={() => {
                  setAwaitingConfirmation(false);
                  setAuthMode("login");
                  setPassword("");
                }}
                className="w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] transition-colors active:scale-[0.98]"
              >
                I confirmed my email — Sign in
              </button>

              <p className="mt-4 text-xs text-gray-400">
                Didn&apos;t receive it? Check your spam folder, or{" "}
                <button
                  onClick={() => {
                    setAwaitingConfirmation(false);
                    setAuthMode("register");
                    setEmail(registeredEmail);
                  }}
                  className="text-[#0f1f3d] font-semibold hover:underline"
                >
                  try again
                </button>
                .
              </p>
            </div>

            <p className="text-center mt-6">
              <a href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← Back to home
              </a>
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">

          {/* Logo + context */}
          <div className="text-center mb-8">
            <a href="/" className="inline-block mb-5">
              <Logo size="lg" variant="light" />
            </a>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {authMode === "login" ? "Welcome back." : "Create your account."}
            </h1>
            <p className="text-sm text-gray-500">
              {authMode === "login"
                ? "Sign in to access your permit history and reports."
                : "Start running permit checks on any address."}
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <form onSubmit={handleAuth}>
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
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none text-gray-900"
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
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[#0f1f3d] focus:ring-1 focus:ring-[#0f1f3d] outline-none text-gray-900"
                  required
                  minLength={8}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    Password must be at least 8 characters
                  </p>
                )}
              </div>

              {authError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={!email || password.length < 8}
                className="w-full py-3 bg-[#0f1f3d] text-white rounded-xl font-bold text-sm hover:bg-[#1a3560] disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
              >
                {authMode === "login" ? "Sign In" : "Create Account"}
              </button>

              <p className="mt-4 text-center text-sm text-gray-500">
                {authMode === "login" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthMode("register"); setAuthError(null); }}
                      className="text-[#0f1f3d] font-semibold hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthMode("login"); setAuthError(null); }}
                      className="text-[#0f1f3d] font-semibold hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>

          {/* Back to home */}
          <p className="text-center mt-6">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back to home
            </a>
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Your Lookup History
          </h1>
          <button
            onClick={async () => {
              const supabase = getSupabaseClient();
              await supabase.auth.signOut();
              setIsAuthenticated(false);
              setLookups([]);
              setUserProfile(null);
              setSession(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </div>

        {typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("subscription") === "success" && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-green-800 font-medium text-sm">
              Agent Plan activated — unlimited searches are now available.
            </p>
          </div>
        )}

        {userProfile && (
          <div className="mb-8 p-5 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {userProfile.agent_name ?? session?.user?.email}
                </div>
                {userProfile.brokerage && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {userProfile.brokerage}
                  </div>
                )}
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  hasAgentAccess(userProfile.subscription_status)
                    ? "bg-[#c9a84c]/10 text-[#c9a84c]"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {hasAgentAccess(userProfile.subscription_status)
                  ? "Agent Plan — Active"
                  : userProfile.subscription_status === "canceled"
                  ? "Subscription Canceled"
                  : userProfile.subscription_status === "past_due"
                  ? "Payment Failed"
                  : "No Active Subscription"}
              </span>
            </div>

            {hasAgentAccess(userProfile.subscription_status) ? (
              <button
                onClick={handleManageSubscription}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Manage billing →
              </button>
            ) : (
              <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-sm text-gray-700 font-medium mb-3">
                  {getSubscriptionMessage(userProfile.subscription_status)}
                </p>
                <a
                  href="/subscribe"
                  className="inline-block text-sm font-semibold text-white bg-[#0f1f3d] px-4 py-2 rounded-lg hover:bg-[#1a3560] transition-colors"
                >
                  {getSubscriptionCTA(userProfile.subscription_status)}
                </a>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading history">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-5 w-64 bg-gray-200 rounded mb-3" />
                <div className="flex gap-4">
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                  <div className="h-4 w-20 bg-gray-100 rounded" />
                  <div className="h-5 w-16 bg-gray-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : lookups.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Your Lookups</h2>
              {lookups.filter((l) => l.payment_status === "paid").length >= 2 && (
                <button
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedForCompare(new Set());
                  }}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    compareMode
                      ? "bg-[#0f1f3d] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {compareMode ? "Exit Compare" : "Compare Properties"}
                </button>
              )}
            </div>

            <div className="space-y-4">
              {lookups.map((lookup) => {
                const report = lookup.reports?.[0];
                const isExpired = report
                  ? new Date(report.expires_at) < new Date()
                  : true;
                const isSelected = selectedForCompare.has(lookup.id);

                return (
                  <div
                    key={lookup.id}
                    className={`relative bg-white border rounded-xl p-6 flex items-center justify-between transition-all ${
                      compareMode && isSelected
                        ? "border-[#0f1f3d] ring-2 ring-[#0f1f3d]/20"
                        : "border-gray-200"
                    }`}
                  >
                    {compareMode && lookup.payment_status === "paid" && (
                      <button
                        onClick={() => toggleCompare(lookup.id)}
                        className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-[#0f1f3d] border-[#0f1f3d]"
                            : "border-gray-300 hover:border-[#0f1f3d]"
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {lookup.address_raw || lookup.address_normalized}
                      </h3>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-500">
                          {new Date(lookup.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {lookup.permit_count} permits
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                          {lookup.report_type}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/results/${lookup.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Results
                      </a>
                      {report && !isExpired && (
                        <a
                          href={report.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm px-4 py-2 bg-[#0f1f3d] text-white rounded-lg hover:bg-[#1a3560] transition-colors"
                        >
                          Download PDF
                        </a>
                      )}
                      {report && isExpired && (
                        <span className="text-sm text-gray-400">
                          Report expired
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparison Panel */}
            {compareMode && selectedForCompare.size >= 2 && (
              <div className="mt-6 p-5 bg-white border border-gray-200 rounded-xl">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  Comparing {selectedForCompare.size} properties
                </h3>
                <div className={`grid gap-4 grid-cols-2 ${
                  selectedForCompare.size === 3 ? "sm:grid-cols-3"
                  : selectedForCompare.size === 4 ? "sm:grid-cols-4"
                  : ""
                }`}>
                  {lookups
                    .filter((l) => selectedForCompare.has(l.id))
                    .map((lookup) => {
                      const report = lookup.reports?.[0];
                      const riskLevel = report?.risk_level as "low" | "medium" | "high" | null;

                      return (
                        <div key={lookup.id} className="text-center">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide mb-3 ${
                            riskLevel === "high"
                              ? "bg-red-100 text-red-800"
                              : riskLevel === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : riskLevel === "low"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              riskLevel === "high" ? "bg-red-500"
                              : riskLevel === "medium" ? "bg-yellow-500"
                              : riskLevel === "low" ? "bg-green-500"
                              : "bg-gray-400"
                            }`} />
                            {riskLevel ? `${riskLevel} risk` : "No analysis"}
                          </div>
                          <div className="text-xs font-medium text-gray-900 mb-1 leading-tight">
                            {lookup.address_normalized || lookup.address_raw}
                          </div>
                          <div className="text-xs text-gray-500 mb-3">
                            {lookup.permit_count ?? 0} permits
                          </div>
                          {report && (
                            <a
                              href={`/results/${lookup.id}`}
                              className="text-xs text-[#0f1f3d] underline"
                            >
                              View report →
                            </a>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No lookups yet
            </h3>
            <p className="text-gray-500 mb-6">
              Your permit lookup history will appear here.
            </p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-[#0f1f3d] text-white rounded-lg font-semibold hover:bg-[#1a3560] transition-colors"
            >
              Search an Address
            </a>
          </div>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
