import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimitStatus, extractClientIp } from "@/lib/ratelimit";
import { UUID_RE } from "@/lib/schemas";

/**
 * GET /api/lookup/:id/status
 * Returns the current status of a lookup (pending, complete, error)
 * and whether it has been paid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  const ip = extractClientIp(request);
  const allowed = await rateLimitStatus(`status:${lookupId}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const supabase = createServerClient();

  const { data: lookup, error } = await supabase
    .from("lookups")
    .select("id, address_normalized, permit_count, paid_at, payment_status, status")
    .eq("id", lookupId)
    .single();

  if (error || !lookup) {
    return NextResponse.json(
      { error: "Lookup not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    lookup_id: lookup.id,
    status: lookup.status ?? "complete", // 'pending' | 'complete' | 'error'
    paid: lookup.paid_at !== null || lookup.payment_status === "paid",
    total_count: lookup.permit_count ?? 0,
    address_normalized: lookup.address_normalized,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
