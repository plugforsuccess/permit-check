import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";
import { config } from "@/lib/config";
import { hasAgentAccess } from "@/lib/subscription";

const checkoutSchema = z.object({
  lookup_id: z.string().uuid(),
  matter_reference: z.string().max(100).optional(),
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

    const { lookup_id, matter_reference, listing_description } = parsed.data;

    // Verify lookup exists and hasn't already been paid
    const supabase = createServerClient();
    const { data: lookup, error: lookupError } = await supabase
      .from("lookups")
      .select("id, address_normalized, payment_status, permit_count, report_type")
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

    // Agent subscribers don't pay per-lookup — reject with guidance
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("subscription_status")
          .eq("id", user.id)
          .single();

        if (profile && hasAgentAccess(profile.subscription_status)) {
          return NextResponse.json(
            { error: "Your Agent Plan includes unlimited searches — no per-lookup payment needed." },
            { status: 400 }
          );
        }
      }
    }

    const reportType = lookup.report_type || "standard";
    const amount =
      reportType === "attorney"
        ? config.pricing.attorneyReport
        : config.pricing.singleLookup;

    const baseUrl = config.app.baseUrl;
    const successUrl = `${baseUrl}/results/${lookup_id}?payment=success`;
    const cancelUrl = `${baseUrl}/results/${lookup_id}`;

    const idempotencyKey = `checkout_${lookup_id}_${reportType}`;
    const session = await createCheckoutSession(
      lookup_id,
      amount,
      reportType as "standard" | "attorney",
      successUrl,
      cancelUrl,
      matter_reference,
      idempotencyKey,
      listing_description
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
