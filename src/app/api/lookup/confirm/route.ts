import { NextResponse } from "next/server";

/**
 * POST /api/lookup/confirm
 * Deprecated: Stripe webhooks have moved to /api/webhooks/stripe.
 * This route exists only to return a helpful error if called directly.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhooks have moved to /api/webhooks/stripe" },
    { status: 410 }
  );
}
