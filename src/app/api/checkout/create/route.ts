import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";
import { config } from "@/lib/config";

const checkoutSchema = z.object({
  lookup_id: z.string().uuid(),
  listing_description: z.string().max(2000).optional(),
});

/**
 * POST /api/checkout/create
 * Creates a Stripe Checkout session for a lookup.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP to prevent checkout spam
    const ip = extractClientIp(request);
    const allowed = await rateLimit(`checkout:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    const raw = await request.json();
    const parsed = checkoutSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { lookup_id, listing_description } = parsed.data;

    // Verify lookup exists and hasn't already been paid
    const supabase = createServerClient();

    // Save listing description to DB before creating Stripe session
    if (listing_description) {
      await supabase
        .from("lookups")
        .update({ listing_description: listing_description.slice(0, 2000) })
        .eq("id", lookup_id);
    }

    const { data: lookup, error: lookupError } = await supabase
      .from("lookups")
      .select("id, address_normalized, payment_status, permit_count")
      .eq("id", lookup_id)
      .single();

    if (lookupError || !lookup) {
      return NextResponse.json(
        { error: "Lookup not found" },
        { status: 404 }
      );
    }

    if (lookup.payment_status === "paid") {
      return NextResponse.json(
        { error: "This lookup has already been paid for" },
        { status: 400 }
      );
    }

    // Admin users get free access
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("is_admin")
          .eq("id", user.id)
          .single();

        if (profile?.is_admin === true) {
          return NextResponse.json(
            { error: "Admin accounts have free access — no payment needed." },
            { status: 400 }
          );
        }
      }
    }

    const baseUrl = config.app.baseUrl;
    const successUrl = `${baseUrl}/results/${lookup_id}?payment=success`;
    const cancelUrl = `${baseUrl}/results/${lookup_id}`;

    const idempotencyKey = `checkout_${lookup_id}`;
    const session = await createCheckoutSession(
      lookup_id,
      config.pricing.singleLookup,
      successUrl,
      cancelUrl,
      idempotencyKey,
    );

    return NextResponse.json({ checkout_url: session.url }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Checkout creation error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
