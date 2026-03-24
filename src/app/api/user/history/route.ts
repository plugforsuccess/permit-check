import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/ratelimit";

/**
 * GET /api/user/history
 * Returns past lookups for an authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const allowed = await rateLimit(`history:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();

    // Verify the token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Fetch user's lookups with report info
    const { data: lookups, error: lookupError } = await supabase
      .from("lookups")
      .select(
        `
        id,
        address_raw,
        address_normalized,
        created_at,
        payment_status,
        permit_count,
        report_type,
        reports (
          id,
          pdf_url,
          expires_at,
          risk_level
        )
      `
      )
      .eq("user_id", user.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(50);

    if (lookupError) {
      console.error("Failed to fetch history:", lookupError);
      return NextResponse.json(
        { error: "Failed to fetch history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ lookups: lookups || [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("History fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
