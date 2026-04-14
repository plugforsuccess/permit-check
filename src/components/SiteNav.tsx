"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "authed" | "unauthed";

export default function SiteNav() {
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");

  const isDashboard = pathname === "/dashboard";

  useEffect(() => {
    if (!isDashboard) return;

    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthStatus(session ? "authed" : "unauthed");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authed" : "unauthed");
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isDashboard]);

  // On /dashboard, hide the nav until we confirm there's a session.
  // This avoids a flash of nav on the sign-in view and removes the
  // redundant Logo + the pointless "Sign In" button that links here.
  if (isDashboard && authStatus !== "authed") {
    return null;
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-white/10 bg-white/80 backdrop-blur-md"
      style={{ WebkitBackdropFilter: "blur(12px)" }}
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <a href="/" className="flex items-center group">
            <Logo size="md" variant="light" />
          </a>
          <div className="flex items-center gap-1">
            <a
              href="/#pricing"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              Pricing
            </a>
            <a
              href="/dashboard"
              className="text-sm font-medium text-white bg-[#0f1f3d] hover:bg-[#1a3560] px-4 py-2 rounded-lg transition-colors ml-1"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
