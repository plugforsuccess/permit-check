import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { UUID_RE } from "@/lib/schemas";
import { config } from "@/lib/config";

const REFRESH_FREE_DAYS = 30;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify lookup is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, payment_status, paid_at, address_normalized")
    .eq("id", lookupId)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment required" },
      { status: 402 }
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

  // Trigger scrape with force=true
  const scrapeUrl = `${config.app.baseUrl}/api/lookup/${lookupId}/scrape?force=true`;
  const scrapeRes = await fetch(scrapeUrl, { method: "POST" });

  if (!scrapeRes.ok) {
    return NextResponse.json(
      { error: "Refresh failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "refreshing",
    free_refresh: isFreeRefresh,
    days_since_paid: daysSincePaid,
  });
}
