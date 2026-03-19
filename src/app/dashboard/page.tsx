"use client";

import { useEffect, useState } from "react";
import Disclaimer from "@/components/Disclaimer";

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      if (authMode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) {
          setAuthError(data.error);
          return;
        }
      }

      // For MVP, store token in sessionStorage
      // In production, use Supabase Auth session management
      const token = btoa(`${email}:${password}`);
      sessionStorage.setItem("auth_token", token);
      setIsAuthenticated(true);
      fetchHistory(token);
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

  useEffect(() => {
    const token = sessionStorage.getItem("auth_token");
    if (token) {
      setIsAuthenticated(true);
      fetchHistory(token);
    } else {
      setLoading(false);
    }
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
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
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
            onClick={() => {
              sessionStorage.removeItem("auth_token");
              setIsAuthenticated(false);
              setLookups([]);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading your history...</p>
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
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
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
                      {lookup.address_normalized}
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
                        className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
