import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/lookup/:id/status
 * Returns whether a lookup has been paid.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  const supabase = createServerClient();

  const { data: lookup, error } = await supabase
    .from("lookups")
    .select("id, address_normalized, permit_count, paid_at, payment_status")
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
    paid: lookup.paid_at !== null || lookup.payment_status === "paid",
    permit_count: lookup.permit_count ?? 0,
    address_normalized: lookup.address_normalized,
  });
}
