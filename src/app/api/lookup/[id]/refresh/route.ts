import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { UUID_RE } from "@/lib/schemas";
import { rateLimit } from "@/lib/ratelimit";

const REFRESH_FREE_DAYS = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  // Rate limit by lookup ID — prevents repeated refresh abuse
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await rateLimit(`refresh:${ip}:${lookupId}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const supabase = createServerClient();

  // Verify lookup exists and is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, payment_status, paid_at, address_normalized, status")
    .eq("id", lookupId)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment required" },
      { status: 402 }
    );
  }

  // Only allow refresh when scrape is complete — prevent mid-scrape data corruption
  if (lookup.status !== "complete") {
    return NextResponse.json(
      { error: "Lookup is not yet complete" },
      { status: 409 }
    );
  }

  // Check if within free refresh window
  const daysSincePaid = lookup.paid_at
    ? Math.floor(
        (Date.now() - new Date(lookup.paid_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 999;

  const isFreeRefresh = daysSincePaid <= REFRESH_FREE_DAYS;

  if (!isFreeRefresh) {
    // Future: charge for refresh outside 30-day window
    // For now, allow free refresh always
  }

  // Delete existing permits
  await supabase
    .from("permits")
    .delete()
    .eq("lookup_id", lookupId);

  // Delete stale report (AI summary, PDF, risk_level) so it gets regenerated
  await supabase
    .from("reports")
    .delete()
    .eq("lookup_id", lookupId);

  // Reset lookup status so scrape endpoint will accept it
  await supabase
    .from("lookups")
    .update({ status: "pending", permit_count: 0 })
    .eq("id", lookupId);

  return NextResponse.json({
    status: "ready_to_scrape",
    free_refresh: isFreeRefresh,
    days_since_paid: daysSincePaid,
  });
}
