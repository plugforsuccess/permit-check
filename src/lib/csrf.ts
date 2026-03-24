import { NextRequest, NextResponse } from "next/server";

/**
 * Paths that use their own authentication and don't need origin checks.
 * Webhooks verify signatures; cron endpoints require CRON_SECRET.
 */
const ORIGIN_EXEMPT_PREFIXES = ["/api/webhooks/", "/api/cron/"];

/**
 * Validate Origin header on state-changing requests.
 * Prevents CSRF attacks by rejecting requests from unexpected origins.
 */
export function originMiddleware(request: NextRequest): NextResponse | null {
  if (request.method !== "POST" && request.method !== "PUT" && request.method !== "DELETE" && request.method !== "PATCH") {
    return null;
  }

  // Paths with their own auth (signature / secret) skip origin check
  const pathname = request.nextUrl.pathname;
  if (ORIGIN_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Require at least one of Origin or Referer on browser-facing POST routes.
  // Omitting both was previously allowed for "server-to-server" but that
  // effectively disabled CSRF protection — legitimate browser requests always
  // send at least one header.
  if (!origin && !referer) {
    return NextResponse.json(
      { error: "Missing origin header" },
      { status: 403 }
    );
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
