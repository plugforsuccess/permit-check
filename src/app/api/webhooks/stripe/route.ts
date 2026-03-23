import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { getStripe } from "@/lib/stripe";
import { generatePermitSummary } from "@/lib/summary";
import { fetchPropertyData } from "@/lib/property-data";
import { generateReportHtml } from "@/lib/pdf";
import { generatePdfFromHtml } from "@/lib/pdf-generator";
import { log } from "@/lib/logger";
import { sendReportEmail } from "@/lib/email";
import type { PermitSummary } from "@/lib/summary";
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

  // Handle subscription lifecycle events
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.user_id;

    if (userId) {
      const supabase = createServerClient();
      await supabase
        .from("users")
        .update({
          subscription_status: subscription.status as string,
        })
        .eq("id", userId);

      log.info("Webhook: subscription status updated", {
        userId,
        status: subscription.status,
      });
    }

    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Subscription checkout — handle separately from per-lookup payments
    if (session.mode === "subscription") {
      const userId = session.metadata?.user_id;

      if (userId && session.customer) {
        const supabase = createServerClient();
        await supabase.from("users").upsert({
          id: userId,
          email: session.customer_email ?? "",
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: "active",
        });

        log.info("Webhook: agent subscription activated", { userId });
      }

      return NextResponse.json({ received: true });
    }

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
          listingDescription,
          lookup.is_unit ?? false,
          lookup.development_level_permits ?? false,
          lookup.permits_truncated ?? false,
        );
        aiSummary = JSON.stringify(summary);
        riskLevel = summary.riskLevel;
        log.info("Webhook: summary generated", { lookupId, riskLevel });
      } catch (err) {
        log.error("Webhook: summary generation failed", { lookupId, error: String(err) });
        // Don't block report creation if summary fails
      }

      // Pre-generate PDF for attorney reports
      let pdfStoragePath: string | null = null;
      let parsedSummary: PermitSummary | null = null;

      if (aiSummary) {
        try {
          parsedSummary = JSON.parse(aiSummary) as PermitSummary;
        } catch {
          // ignore parse error
        }
      }

      if (reportType === "attorney") {
        try {
          const reportHtml = generateReportHtml({
            address: lookup.address_normalized,
            lookupDate: new Date(lookup.created_at).toISOString().split("T")[0],
            lookupId,
            permits,
            reportType: "attorney",
            matterReference: session.metadata?.matter_reference || undefined,
            summary: parsedSummary,
          });

          const pdfBuffer = await generatePdfFromHtml(reportHtml);
          const fileName = `${lookupId}/report.pdf`;

          const { error: uploadError } = await supabase.storage
            .from("reports")
            .upload(fileName, pdfBuffer, {
              contentType: "application/pdf",
              upsert: true,
            });

          if (uploadError) {
            log.error("Webhook: PDF upload failed", {
              lookupId,
              error: uploadError.message,
            });
          } else {
            pdfStoragePath = fileName;
            log.info("Webhook: PDF pre-generated and stored", { lookupId, fileName });
          }
        } catch (err) {
          log.error("Webhook: PDF generation failed", {
            lookupId,
            error: String(err),
          });
          // Don't block report creation — fall back to on-demand generation
        }
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
            pdf_storage_path: pdfStoragePath,
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

      // Send report email to the buyer
      const customerEmail = session.customer_details?.email;
      if (customerEmail && reportData) {
        try {
          await sendReportEmail({
            to: customerEmail,
            address: lookup.address_normalized,
            lookupId,
            downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}${reportData.pdf_url}`,
            permitCount: permits.length,
            summary: parsedSummary,
            reportType,
            expiresAt: reportData.expires_at,
          });

          log.info("Webhook: report email sent", { lookupId, to: customerEmail });
        } catch (err) {
          log.error("Webhook: email send failed", {
            lookupId,
            error: String(err),
          });
          // Don't block — email failure should not affect payment confirmation
        }
      }
    } else {
      log.warn("Webhook: skipped report insert", { lookupId, hasLookup: !!lookup, hasPermits: !!permits });
    }
  }

  return NextResponse.json({ received: true });
}
