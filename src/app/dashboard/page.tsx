"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import Disclaimer from "@/components/Disclaimer";
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
  }>;
}

export default function DashboardPage() {
  const [lookups, setLookups] = useState<LookupHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [userProfile, setUserProfile] = useState<{
    agent_name: string | null;
    brokerage: string | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
  } | null>(null);
  const [session, setSession] = useState<{ user: { id: string; email?: string }; access_token: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      const supabase = getSupabaseClient();

      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setAuthError(error.message);
          return;
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
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
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">
            {authMode === "login" ? "Sign In" : "Create Account"}
          </h1>

          <form
            onSubmit={handleAuth}
            className="bg-white p-8 rounded-xl shadow-sm border border-gray-200"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-gray-900"
                required
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-gray-900"
                required
                minLength={8}
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
              className="w-full py-3 bg-[#0f1f3d] text-white rounded-lg font-semibold hover:bg-[#1a3560] transition-colors"
            >
              {authMode === "login" ? "Sign In" : "Create Account"}
            </button>

            <p className="mt-4 text-center text-sm text-gray-600">
              {authMode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
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
        ) : lookups.length === 0 ? (
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
        ) : (
          <div className="space-y-4">
            {lookups.map((lookup) => {
              const report = lookup.reports?.[0];
              const isExpired = report
                ? new Date(report.expires_at) < new Date()
                : true;

              return (
                <div
                  key={lookup.id}
                  className="bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-between"
                >
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
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
