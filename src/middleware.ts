import { NextRequest, NextResponse } from "next/server";
import { originMiddleware } from "@/lib/csrf";

export function middleware(request: NextRequest) {
  // CSRF: Validate Origin header on API POST requests
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const blocked = originMiddleware(request);
    if (blocked) return blocked;
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
