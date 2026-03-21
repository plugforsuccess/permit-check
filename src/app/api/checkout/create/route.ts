import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { config } from "@/lib/config";

const checkoutSchema = z.object({
  lookup_id: z.string().uuid(),
  matter_reference: z.string().max(100).optional(),
});

/**
 * POST /api/checkout/create
 * Creates a Stripe Checkout session for a lookup.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = checkoutSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { lookup_id, matter_reference } = parsed.data;

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

    const reportType = lookup.report_type || "standard";
    const amount =
      reportType === "attorney"
        ? config.pricing.attorneyReport
        : config.pricing.singleLookup;

    const baseUrl = config.app.baseUrl;
    const successUrl = `${baseUrl}/results/${lookup_id}?payment=success`;
    const cancelUrl = `${baseUrl}/results/${lookup_id}`;

    const session = await createCheckoutSession(
      lookup_id,
      amount,
      reportType as "standard" | "attorney",
      successUrl,
      cancelUrl,
      matter_reference
    );

    return NextResponse.json({ checkout_url: session.url });
  } catch (error) {
    console.error("Checkout creation error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
