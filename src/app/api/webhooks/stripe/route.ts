import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { config } from "@/lib/config";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { generatePermitSummary } from "@/lib/summary";
import { fetchPropertyData } from "@/lib/property-data";
import { log } from "@/lib/logger";
import { sendReportEmail } from "@/lib/email";
import { inngest } from "@/inngest/client";
import { DEFAULT_REPORT_INTENT } from "@/lib/agent/steps/plan";
import type { PermitSummary } from "@/lib/summary";
import type Stripe from "stripe";

// Lookup row shape used by both paths. Fields the legacy path reads;
// extended where the new path needs additional fields.
type LookupRow = {
  id: string;
  user_id: string | null;
  address_normalized: string;
  address_raw: string | null;
  is_unit: boolean | null;
  development_level_permits: boolean | null;
  permits_truncated: boolean | null;
  used_fuzzy_match: boolean | null;
  listing_description: string | null;
  created_at: string;
  [key: string]: unknown;
};

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

    // Mark legacy `lookups` row as paid. Both paths need this — downstream
    // read routes (`/api/lookup/[id]/results`, `/api/report/[id]/download`)
    // gate access on `lookups.payment_status='paid'`. Until those routes
    // migrate to read from `reports_v2`, the legacy row keeps the access
    // gate working (parallel-tables strategy).
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

    // Fetch lookup. Both paths need this — legacy path uses it for
    // permits-fetch + summary inputs; new path uses it to check user_id
    // (D34 anonymous-payment branch).
    const { data: lookupData, error: lookupFetchError } = await supabase
      .from("lookups")
      .select("*")
      .eq("id", lookupId)
      .single();

    log.info("Webhook: lookup fetch", {
      lookupId: lookupData?.id,
      error: lookupFetchError?.message,
    });

    if (!lookupData) {
      log.warn("Webhook: lookup not found post-mark-paid", { lookupId });
      return NextResponse.json({ received: true });
    }

    const lookup = lookupData as LookupRow;

    // ---- Branch decision (D33 / D34) -------------------------------------
    // D33: USE_INNGEST_REPORTS=true ships in PR5 plumbing; the flag flips
    //      to true in PR6 (when the agent loop has real deterministic steps).
    // D34: anonymous lookups (lookup.user_id IS NULL) stay on legacy path
    //      until PR8 magic-link makes auth a payment precondition. Branch
    //      tagged TODO(D34); branch deletion happens in PR8 itself.
    // ----------------------------------------------------------------------
    if (env.USE_INNGEST_REPORTS) {
      if (lookup.user_id === null) {
        // TODO(D34): remove this branch when PR8 magic-link makes
        // unauthenticated checkout impossible. Until then, anonymous
        // payments fall through to the legacy inline path because
        // reports_v2.user_id is NOT NULL.
        log.info("Webhook: anonymous payment routed to legacy path (D34)", {
          lookupId,
        });
        await runLegacyInlinePath(supabase, lookup, lookupId, session);
        return NextResponse.json({ received: true });
      }

      // Authenticated user + flag on: new Inngest path.
      await runInngestPath(supabase, lookup, lookupId, session);
      return NextResponse.json({ received: true });
    }

    // Flag off: legacy inline path for everyone.
    await runLegacyInlinePath(supabase, lookup, lookupId, session);
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Path implementations
// ---------------------------------------------------------------------------

/**
 * The new path: insert a `reports_v2` row in `pending` and emit the
 * `report.requested` Inngest event. Returns fast (<1s target). The agent
 * loop in `src/lib/agent/orchestrator.ts` picks up the event and runs the
 * eight-step pipeline; legacy `summary.ts` is never invoked on this path.
 *
 * Idempotent at the DB level via `reports_v2.stripe_payment_intent_id UNIQUE`.
 * Stripe retries that hit a duplicate insert get logged and short-circuit
 * without re-emitting the event.
 */
async function runInngestPath(
  supabase: ReturnType<typeof createServerClient>,
  lookup: LookupRow,
  lookupId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  // user_id is non-null here (D34 branch above guarantees it). Cast for type.
  const userId = lookup.user_id as string;

  const { data: newReport, error: insertError } = await supabase
    .from("reports_v2")
    .insert({
      user_id: userId,
      property_id: null, // resolved in step 2 (parcel) of the agent loop
      raw_address: lookup.address_raw ?? lookup.address_normalized,
      status: "pending",
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique_violation. Stripe sent the same checkout.session.completed
    // twice for the same payment_intent — the first webhook already inserted
    // and emitted the event. Idempotent short-circuit.
    if (insertError.code === "23505") {
      log.info("Webhook: reports_v2 row already exists (Stripe retry)", {
        lookupId,
        paymentIntentId,
      });
      return;
    }

    log.error("Webhook: reports_v2 insert failed", {
      lookupId,
      error: insertError.message,
      step_name: "stripe_webhook",
      event_type: "reports_v2_insert_failed",
    });
    return;
  }

  if (!newReport) {
    log.error("Webhook: reports_v2 insert returned no row", { lookupId });
    return;
  }

  // Emit the agent-loop event. Order matters: row insert first, then event.
  // If the event-emit fails after a successful insert, Stripe will retry
  // the webhook → idempotent insert no-ops via the 23505 path → ... but
  // we'd lose the event. Acceptable risk given Stripe retries 5xx; if
  // event-emit fails here we surface 5xx and let the retry land.
  try {
    await inngest.send({
      name: "report.requested",
      data: {
        report_id: newReport.id,
        address: lookup.address_normalized,
        intent: DEFAULT_REPORT_INTENT,
      },
    });

    log.info("Webhook: report.requested emitted", {
      report_id: newReport.id,
      lookupId,
      step_name: "stripe_webhook",
      event_type: "report_requested_emitted",
    });
  } catch (err) {
    log.error("Webhook: inngest.send failed", {
      lookupId,
      report_id: newReport.id,
      error: String(err),
      step_name: "stripe_webhook",
      event_type: "inngest_send_failed",
    });
    // Surface as 5xx so Stripe retries — the inserted reports_v2 row
    // makes the retry idempotent at the DB level.
    throw err;
  }
}

/**
 * The legacy path: REAPI fetch, AI summary inline (Sonnet via summary.ts),
 * insert into legacy `reports` table, send email. This is the pre-PR5
 * behavior, preserved verbatim while `USE_INNGEST_REPORTS=false` (default
 * through PR6) and routed to for anonymous payments per D34.
 *
 * Removed in PR8 alongside the magic-link migration that closes the
 * unauthenticated checkout path.
 */
async function runLegacyInlinePath(
  supabase: ReturnType<typeof createServerClient>,
  lookup: LookupRow,
  lookupId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { data: permits, error: permitsFetchError } = await supabase
    .from("permits")
    .select("*")
    .eq("lookup_id", lookupId);

  log.info("Webhook: permits fetch", {
    count: permits?.length,
    error: permitsFetchError?.message,
  });

  if (!permits) {
    log.warn("Webhook: skipped report insert", {
      lookupId,
      hasLookup: true,
      hasPermits: false,
    });
    return;
  }

  // Fetch property data from REAPI (non-blocking)
  let propertyData = null;
  try {
    propertyData = await fetchPropertyData(lookup.address_normalized);
    log.info("Webhook: property data fetched", {
      lookupId,
      hasData: !!propertyData,
    });
  } catch (err) {
    log.warn("Webhook: property data fetch failed", {
      lookupId,
      error: String(err),
    });
  }

  // Generate AI summary with property context
  let aiSummary: string | null = null;
  let riskLevel: string | null = null;

  const listingDescription = lookup.listing_description || null;

  try {
    const summary = await generatePermitSummary(
      permits,
      lookup.address_normalized,
      propertyData,
      listingDescription,
      lookup.is_unit ?? false,
      lookup.development_level_permits ?? false,
      lookup.permits_truncated ?? false,
      lookup.used_fuzzy_match ?? false,
    );
    aiSummary = JSON.stringify(summary);
    riskLevel = summary.riskLevel;
    log.info("Webhook: summary generated", { lookupId, riskLevel });
  } catch (err) {
    log.error("Webhook: summary generation failed", {
      lookupId,
      error: String(err),
    });
    // Don't block report creation if summary fails
  }

  let parsedSummary: PermitSummary | null = null;

  if (aiSummary) {
    try {
      parsedSummary = JSON.parse(aiSummary) as PermitSummary;
    } catch {
      // ignore parse error
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
        expires_at: expiresAt.toISOString(),
        download_token: downloadToken,
        ai_summary: aiSummary,
        risk_level: riskLevel,
      },
      { onConflict: "lookup_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  log.info("Webhook: report insert result", {
    reportId: reportData?.id,
    error: reportError?.message,
  });

  if (reportError) {
    log.error("Webhook: report insert failed", {
      lookupId,
      error: reportError.message,
    });
  }

  // Send report email to the buyer
  const customerEmail = session.customer_details?.email;
  if (customerEmail && reportData) {
    try {
      await sendReportEmail({
        to: customerEmail,
        address: lookup.address_normalized,
        lookupId,
        downloadUrl: `${env.NEXT_PUBLIC_APP_URL}${reportData.pdf_url}`,
        permitCount: permits.length,
        summary: parsedSummary,
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
}
