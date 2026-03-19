import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { generateReportHtml } from "@/lib/pdf";
import Stripe from "stripe";

/**
 * Stripe webhook handler.
 * Confirms payment and triggers report generation.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: "2026-02-25.clover",
    });
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
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

    // Update lookup payment status
    const { error: updateError } = await supabase
      .from("lookups")
      .update({
        payment_status: "paid",
        payment_id: session.payment_intent as string,
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
      // Generate report HTML
      const reportHtml = generateReportHtml({
        address: lookup.address_normalized,
        lookupDate: new Date().toISOString().split("T")[0],
        lookupId: lookup.id,
        permits,
        reportType,
      });

      // Store report (in production, upload to Supabase Storage or S3)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + config.app.reportExpiryHours);

      const { error: reportError } = await supabase.from("reports").insert({
        lookup_id: lookupId,
        pdf_url: `/api/report/${lookupId}/download`,
        expires_at: expiresAt.toISOString(),
      });

      if (reportError) {
        console.error("Failed to create report:", reportError);
      }

      // Store HTML content for later retrieval (using Supabase storage or inline)
      // For MVP, we regenerate from data on download
      void reportHtml; // Used in production PDF pipeline
    }
  }

  return NextResponse.json({ received: true });
}
