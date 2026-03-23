import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeAddress } from "@/lib/address";
import { detectJurisdiction } from "@/lib/accela/index";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

const MAX_WATCHES_PER_EMAIL = 5;

const schema = z.object({
  address: z.string().min(5).max(200),
  email: z.string().email(),
  lookup_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const allowed = await rateLimit(`watchlist:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const raw = await request.json();
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { address, email, lookup_id } = parsed.data;
  const supabase = createServerClient();

  // Verify lookup exists and is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("payment_status, permit_count")
    .eq("id", lookup_id)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Watchlist requires a paid report" },
      { status: 402 }
    );
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

  // Enforce per-email cap on active watches
  const { count } = await supabase
    .from("watchlist")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("active", true);

  if (count !== null && count >= MAX_WATCHES_PER_EMAIL) {
    return NextResponse.json(
      {
        error: `You can monitor up to ${MAX_WATCHES_PER_EMAIL} addresses at a time. Remove an existing watch to add a new one.`,
      },
      { status: 409 }
    );
  }

  // Free tier: 30-day expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const currentPermitCount = lookup.permit_count ?? 0;

  const { error } = await supabase.from("watchlist").insert({
    lookup_id,
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
