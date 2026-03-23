import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { getStripe } from "@/lib/stripe";
import { generatePermitSummary } from "@/lib/summary";
import { fetchPropertyData } from "@/lib/property-data";
import { log } from "@/lib/logger";
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
      log.error("No lookup_id in session metadata");
      return NextResponse.json({ received: true });
    }

    const supabase = createServerClient();

    // Idempotency: skip if already paid (Stripe retries on 5xx)
    const { data: existingLookup } = await supabase
      .from("lookups")
      .select("payment_status")
      .eq("id", lookupId)
      .single();

    if (existingLookup?.payment_status === "paid") {
      log.info("Webhook: lookup already paid, skipping", { lookupId });
      return NextResponse.json({ received: true });
    }

    // Update lookup payment status and paid_at timestamp
    const { error: updateError } = await supabase
      .from("lookups")
      .update({
        payment_status: "paid",
        payment_id: typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", lookupId);

    if (updateError) {
      log.error("Failed to update lookup", { lookupId, error: updateError.message });
      return NextResponse.json(
        { error: "Failed to update lookup" },
        { status: 500 }
      );
    }

    // Fetch lookup and permits for report generation
    const { data: lookup, error: lookupFetchError } = await supabase
      .from("lookups")
      .select("*")
      .eq("id", lookupId)
      .single();

    log.info("Webhook: lookup fetch", { lookupId: lookup?.id, error: lookupFetchError?.message });

    const { data: permits, error: permitsFetchError } = await supabase
      .from("permits")
      .select("*")
      .eq("lookup_id", lookupId);

    log.info("Webhook: permits fetch", { count: permits?.length, error: permitsFetchError?.message });

    if (lookup && permits) {
      // Fetch property data from REAPI (non-blocking)
      let propertyData = null;
      try {
        propertyData = await fetchPropertyData(lookup.address_normalized);
        log.info("Webhook: property data fetched", { lookupId, hasData: !!propertyData });
      } catch (err) {
        log.warn("Webhook: property data fetch failed", { lookupId, error: String(err) });
      }

      // Generate AI summary with property context
      let aiSummary: string | null = null;
      let riskLevel: string | null = null;

      const listingDescription = session.metadata?.listing_description || null;

      try {
        const summary = await generatePermitSummary(
          permits,
          lookup.address_normalized,
          propertyData,
          listingDescription
        );
        aiSummary = JSON.stringify(summary);
        riskLevel = summary.riskLevel;
        log.info("Webhook: summary generated", { lookupId, riskLevel });
      } catch (err) {
        log.error("Webhook: summary generation failed", { lookupId, error: String(err) });
        // Don't block report creation if summary fails
      }

      // Store report record
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + config.app.reportExpiryHours);

      const downloadToken = randomBytes(32).toString("hex");

      log.info("Webhook: inserting report", { lookupId });

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .upsert(
          {
            lookup_id: lookupId,
            pdf_url: `/api/report/${lookupId}/download?token=${downloadToken}`,
            expires_at: expiresAt.toISOString(),
            download_token: downloadToken,
            matter_reference: session.metadata?.matter_reference || null,
            ai_summary: aiSummary,
            risk_level: riskLevel,
          },
          { onConflict: "lookup_id", ignoreDuplicates: false }
        )
        .select()
        .single();

      log.info("Webhook: report insert result", { reportId: reportData?.id, error: reportError?.message });

      if (reportError) {
        log.error("Webhook: report insert failed", { lookupId, error: reportError.message });
      }
    } else {
      log.warn("Webhook: skipped report insert", { lookupId, hasLookup: !!lookup, hasPermits: !!permits });
    }
  }

  return NextResponse.json({ received: true });
}
