import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { generateReportHtml } from "@/lib/pdf";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

/**
 * POST /api/webhooks/stripe
 * Stripe webhook handler — verifies signature before processing any data.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "No signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      config.stripe.webhookSecret
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const lookupId = session.metadata?.lookup_id;
    const reportType =
      (session.metadata?.report_type as "standard" | "attorney") || "standard";

    if (!lookupId) {
      console.error("No lookup_id in session metadata");
      return NextResponse.json({ received: true });
    }

    const supabase = createServerClient();

    // Update lookup payment status and paid_at timestamp
    const { error: updateError } = await supabase
      .from("lookups")
      .update({
        payment_status: "paid",
        payment_id: session.payment_intent as string,
        paid_at: new Date().toISOString(),
      })
      .eq("id", lookupId);

    if (updateError) {
      console.error("Failed to update lookup:", updateError);
      return NextResponse.json(
        { error: "Failed to update lookup" },
        { status: 500 }
      );
    }

    // Fetch lookup and permits for report generation
    const { data: lookup } = await supabase
      .from("lookups")
      .select("*")
      .eq("id", lookupId)
      .single();

    const { data: permits } = await supabase
      .from("permits")
      .select("*")
      .eq("lookup_id", lookupId);

    if (lookup && permits) {
      // Generate report HTML (used in production PDF pipeline)
      generateReportHtml({
        address: lookup.address_normalized,
        lookupDate: new Date().toISOString().split("T")[0],
        lookupId: lookup.id,
        permits,
        reportType,
      });

      // Store report record
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + config.app.reportExpiryHours);

      const downloadToken = randomBytes(32).toString("hex");

      const { error: reportError } = await supabase.from("reports").insert({
        lookup_id: lookupId,
        pdf_url: `/api/report/${lookupId}/download?token=${downloadToken}`,
        expires_at: expiresAt.toISOString(),
        download_token: downloadToken,
      });

      if (reportError) {
        console.error("Failed to create report:", reportError);
      }
    }
  }

  return NextResponse.json({ received: true });
}
