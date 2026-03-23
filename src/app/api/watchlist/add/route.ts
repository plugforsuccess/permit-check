import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeAddress } from "@/lib/address";
import { detectJurisdiction } from "@/lib/accela/index";
import { z } from "zod";

const schema = z.object({
  address: z.string().min(5).max(200),
  email: z.string().email(),
  lookup_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const raw = await request.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { address, email, lookup_id } = parsed.data;
  const supabase = createServerClient();

  // Verify email is from a paid lookup if lookup_id provided
  if (lookup_id) {
    const { data: lookup } = await supabase
      .from("lookups")
      .select("payment_status, address_normalized, permit_count")
      .eq("id", lookup_id)
      .single();

    if (!lookup || lookup.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Watchlist requires a paid report" },
        { status: 402 }
      );
    }
  }

  const addressNormalized = normalizeAddress(address);
  const jurisdictionId = detectJurisdiction(address);

  // Check if already watching this address+email
  const { data: existing } = await supabase
    .from("watchlist")
    .select("id, active")
    .eq("address_normalized", addressNormalized)
    .eq("email", email)
    .single();

  if (existing?.active) {
    return NextResponse.json({
      success: true,
      message: "Already monitoring this address",
      already_active: true,
    });
  }

  // Free tier: 30-day expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Get current permit count for baseline
  let currentPermitCount = 0;
  if (lookup_id) {
    const { data: lookup } = await supabase
      .from("lookups")
      .select("permit_count")
      .eq("id", lookup_id)
      .single();
    currentPermitCount = lookup?.permit_count ?? 0;
  }

  const { error } = await supabase.from("watchlist").insert({
    lookup_id: lookup_id ?? null,
    address_normalized: addressNormalized,
    jurisdiction_id: jurisdictionId,
    email,
    active: true,
    last_permit_count: currentPermitCount,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to add watchlist" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Now monitoring this address for 30 days",
    expires_at: expiresAt.toISOString(),
  });
}
