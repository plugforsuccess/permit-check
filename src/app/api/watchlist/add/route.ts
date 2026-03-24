import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeAddress } from "@/lib/address";
import { detectJurisdiction } from "@/lib/accela/index";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";
import { z } from "zod";

const MAX_WATCHES_PER_EMAIL = 5;

const schema = z.object({
  address: z.string().min(5).max(200),
  email: z.string().email(),
  lookup_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = extractClientIp(request);
  const allowed = await rateLimit(`watchlist:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { address, email: rawEmail, lookup_id } = parsed.data;
  const email = rawEmail.toLowerCase();
  const supabase = createServerClient();

  // Verify lookup exists and is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("payment_status, permit_count, address_normalized")
    .eq("id", lookup_id)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Watchlist requires a paid report" },
      { status: 402 }
    );
  }

  // Use the lookup's stored normalized address — don't trust the client's
  // address value, which could differ from what was actually paid for.
  const addressNormalized = lookup.address_normalized || normalizeAddress(address);
  const jurisdictionId = detectJurisdiction(addressNormalized);
  const now = new Date();

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

  // Enforce per-email cap on active, non-expired watches only
  const { count } = await supabase
    .from("watchlist")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);

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

  // Upsert to handle TOCTOU race: if a concurrent request inserted the same
  // address+email between our check and this insert, we re-activate instead
  // of creating a duplicate. Requires a unique index on
  // (address_normalized, email) — see migration notes.
  if (existing && !existing.active) {
    // Re-activate an existing inactive watch
    const { error } = await supabase
      .from("watchlist")
      .update({
        lookup_id,
        jurisdiction_id: jurisdictionId,
        active: true,
        last_permit_count: currentPermitCount,
        expires_at: expiresAt.toISOString(),
        last_checked_at: null,
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to add watchlist" },
        { status: 500 }
      );
    }
  } else {
    // Insert new watch
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
      // If duplicate key error from race, treat as success
      if (error.code === "23505") {
        return NextResponse.json({
          success: true,
          message: "Already monitoring this address",
          already_active: true,
        });
      }
      return NextResponse.json(
        { error: "Failed to add watchlist" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    message: "Now monitoring this address for 30 days",
    expires_at: expiresAt.toISOString(),
  });
}
