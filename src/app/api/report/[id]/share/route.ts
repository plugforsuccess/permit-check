import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { randomBytes, timingSafeEqual } from "crypto";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { UUID_RE } from "@/lib/schemas";

/** Constant-time string comparison to prevent timing attacks on tokens. */
function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  // Rate limit: 5 share requests per minute per lookup
  const rateLimitKey = `share:${lookupId}`;
  const allowed = await rateLimit(rateLimitKey);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  // Require download token for authorization — only report owner has this
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    // Also check request body for token
    let bodyToken: string | null = null;
    try {
      const body = await request.json();
      bodyToken = body.token ?? null;
    } catch {
      // no body
    }
    if (!bodyToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    // Use bodyToken below
    return handleShare(lookupId, bodyToken);
  }

  return handleShare(lookupId, token);
}

async function handleShare(lookupId: string, token: string) {
  const supabase = createServerClient();

  // Verify token matches the report — proves caller owns the report
  const { data: report } = await supabase
    .from("reports")
    .select("id, download_token, share_token, share_expires_at")
    .eq("lookup_id", lookupId)
    .single();

  if (!report || !safeTokenEqual(report.download_token, token)) {
    return NextResponse.json(
      { error: "Report not found or unauthorized" },
      { status: 404 }
    );
  }

  // Verify the lookup is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, payment_status")
    .eq("id", lookupId)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Report not found or not paid" },
      { status: 404 }
    );
  }

  // If share token exists and not expired, return it
  if (
    report.share_token &&
    report.share_expires_at &&
    new Date(report.share_expires_at) > new Date()
  ) {
    return NextResponse.json({
      share_url: `${config.app.baseUrl}/shared/${report.share_token}`,
      expires_at: report.share_expires_at,
    });
  }

  // Generate new share token — expires in 7 days
  const shareToken = randomBytes(24).toString("hex");
  const shareExpiresAt = new Date();
  shareExpiresAt.setDate(shareExpiresAt.getDate() + 7);

  await supabase
    .from("reports")
    .update({
      share_token: shareToken,
      share_expires_at: shareExpiresAt.toISOString(),
    })
    .eq("id", report.id);

  return NextResponse.json({
    share_url: `${config.app.baseUrl}/shared/${shareToken}`,
    expires_at: shareExpiresAt.toISOString(),
  });
}
