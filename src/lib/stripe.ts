import Stripe from "stripe";
import { config } from "./config";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(config.stripe.secretKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return stripeInstance;
}

export async function createPaymentIntent(
  lookupId: string,
  amount: number,
  metadata: Record<string, string> = {}
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount,
    currency: "usd",
    metadata: {
      lookup_id: lookupId,
      ...metadata,
    },
  });
}

export async function createCheckoutSession(
  lookupId: string,
  amount: number,
  reportType: "standard" | "attorney",
  successUrl: string,
  cancelUrl: string,
  matterReference?: string,
  idempotencyKey?: string,
  listingDescription?: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name:
                reportType === "attorney"
                  ? "PermitCheck Attorney Report"
                  : "PermitCheck Property Report",
              description:
                reportType === "attorney"
                  ? "Litigation-grade permit report with chain of custody"
                  : "Complete permit history report for property",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_creation: "always",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        lookup_id: lookupId,
        report_type: reportType,
        matter_reference: matterReference ?? "",
        listing_description: listingDescription?.slice(0, 500) ?? "",
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}
