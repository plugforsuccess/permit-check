import { NextRequest, NextResponse } from "next/server";

/**
 * Validate Origin header on state-changing requests.
 * Prevents CSRF attacks by rejecting requests from unexpected origins.
 */
export function originMiddleware(request: NextRequest): NextResponse | null {
  if (request.method !== "POST" && request.method !== "PUT" && request.method !== "DELETE") {
    return null;
  }

  // Stripe webhooks use their own signature verification — skip origin check
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Allow requests without origin header (same-origin browser requests, server-to-server)
  if (!origin && !referer) {
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const allowedOrigins = [
    baseUrl,
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  // Origin is always scheme+host+port (no path) — use exact match to prevent
  // subdomain bypass (e.g. https://permitcheck.com.evil.com)
  const isOriginAllowed = origin && allowedOrigins.includes(origin);

  // Referer includes a path, so startsWith is appropriate here
  const isRefererAllowed = referer && allowedOrigins.some((allowed) => referer.startsWith(allowed));

  if (!isOriginAllowed && !isRefererAllowed) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 }
    );
  }

  return null;
}
