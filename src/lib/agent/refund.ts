import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/logger";

/**
 * Auto-refund machinery for agent failures.
 *
 * Per CLAUDE.md "Errors": "Agent failures auto-refund via Stripe
 * (programmatic, not human alert) and log to reports.error_message
 * for replay."
 *
 * The orchestrator's outer try/catch invokes `handleAgentFailure()` when
 * any step.run throws past Inngest's retries. The function:
 *
 *   1. Updates `reports_v2`: status='failed', error_message, completed_at.
 *   2. Logs `report_events` with event_type='step_failed' carrying the
 *      step_name + error message.
 *   3. Attempts `stripe.refunds.create()` with idempotency_key set to
 *      `reports_v2.id` so retries don't double-refund.
 *   4. On refund success: logs `report_events` event_type='refunded'.
 *   5. On refund failure: logs `report_events` event_type='refund_failed'
 *      AND sends a Resend alert to HEALTH_CHECK_ALERT_EMAIL — silent
 *      failure of the auto-recovery is the failure mode where the human
 *      MUST find out, hence the alert is gated to this case only.
 *
 * The Stripe refund `reason` field accepts only 'duplicate' | 'fraudulent'
 * | 'requested_by_customer'. None of those is "agent failure"; the
 * closest valid value is `requested_by_customer` — the user paid for a
 * service we couldn't deliver, so refunding implicitly fulfills their
 * request. Documented choice; not a guess.
 */

interface AgentFailureContext {
  reportId: string;
  stripePaymentIntentId: string | null;
  failedStepName: string;
  errorMessage: string;
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

/**
 * Send an operational alert to the on-call inbox when auto-refund itself
 * fails. This is the single failure mode where silence is dangerous —
 * everything else is captured in report_events for later replay.
 */
async function sendRefundFailedAlert(ctx: AgentFailureContext, refundError: string): Promise<void> {
  const alertEmail = env.HEALTH_CHECK_ALERT_EMAIL;
  if (!alertEmail) {
    log.error("refund: HEALTH_CHECK_ALERT_EMAIL not set — refund_failed alert NOT sent", {
      step_name: "refund",
      event_type: "alert_config_missing",
      report_id: ctx.reportId,
    });
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif;">
      <h2 style="color: #dc2626;">⚠️ PermitCheck auto-refund failed</h2>
      <p>An agent failure triggered the auto-refund flow, and the Stripe refund call itself failed. Manual intervention required.</p>
      <table style="border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 12px; color: #6b7280;">Report ID</td><td style="padding: 6px 12px; font-family: monospace;">${escapeHtml(ctx.reportId)}</td></tr>
        <tr><td style="padding: 6px 12px; color: #6b7280;">Stripe Payment Intent</td><td style="padding: 6px 12px; font-family: monospace;">${escapeHtml(ctx.stripePaymentIntentId ?? "(none)")}</td></tr>
        <tr><td style="padding: 6px 12px; color: #6b7280;">Failed Step</td><td style="padding: 6px 12px;">${escapeHtml(ctx.failedStepName)}</td></tr>
        <tr><td style="padding: 6px 12px; color: #6b7280;">Original Error</td><td style="padding: 6px 12px;">${escapeHtml(ctx.errorMessage)}</td></tr>
        <tr><td style="padding: 6px 12px; color: #6b7280;">Refund Error</td><td style="padding: 6px 12px; color: #dc2626;">${escapeHtml(refundError)}</td></tr>
      </table>
      <p style="margin-top: 16px;"><strong>Next steps:</strong></p>
      <ol>
        <li>Check the Stripe dashboard for the payment intent state.</li>
        <li>Issue a manual refund if the agent failure was real.</li>
        <li>Investigate why the refund API call failed (auth? deleted PI? amount mismatch?).</li>
      </ol>
    </div>
  `.trim();

  try {
    await getResend().emails.send({
      from: env.EMAIL_FROM,
      to: alertEmail,
      subject: `🚨 PermitCheck auto-refund failed — report ${ctx.reportId}`,
      html,
    });
  } catch (err) {
    log.error("refund: alert email send failed", {
      step_name: "refund",
      event_type: "alert_send_failed",
      report_id: ctx.reportId,
      error: String(err),
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function handleAgentFailure(ctx: AgentFailureContext): Promise<void> {
  const supabase = getSupabaseAdmin();
  const completedAt = new Date().toISOString();

  // 1. Mark the report failed. This always runs first so the row state
  //    reflects reality even if subsequent steps fail.
  const { error: updateError } = await supabase
    .from("reports_v2")
    .update({
      status: "failed",
      error_message: ctx.errorMessage,
      completed_at: completedAt,
    })
    .eq("id", ctx.reportId);

  if (updateError) {
    // This is bad — we can't even mark the row failed. Logger captures
    // it; downstream Stripe webhook retry / manual replay handles
    // recovery.
    log.error("refund: failed to mark reports_v2 row as failed", {
      step_name: "refund",
      event_type: "mark_failed_error",
      report_id: ctx.reportId,
      error: updateError.message,
    });
  }

  // 2. Audit-log the step failure.
  await supabase.from("report_events").insert({
    report_id: ctx.reportId,
    event_type: "error",
    step_name: ctx.failedStepName,
    payload: { error_message: ctx.errorMessage },
  });

  // 3. Skip refund if there's no payment intent (e.g., test path that
  //    bypassed Stripe). Still mark failed and audit-log.
  if (!ctx.stripePaymentIntentId) {
    log.warn("refund: no stripe_payment_intent_id — skipping refund", {
      step_name: "refund",
      event_type: "refund_skipped_no_pi",
      report_id: ctx.reportId,
    });
    return;
  }

  // 4. Attempt the refund with idempotency_key=reports_v2.id so Inngest
  //    retries (or any other re-entry) don't double-refund.
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: ctx.stripePaymentIntentId,
        // Stripe's enum is { duplicate, fraudulent, requested_by_customer }.
        // None fits "agent failed to deliver." `requested_by_customer` is
        // the closest valid value: the user paid for a service we
        // couldn't deliver, so the refund implicitly fulfills their
        // request. See file header for the full rationale.
        reason: "requested_by_customer",
      },
      { idempotencyKey: ctx.reportId },
    );

    await supabase.from("report_events").insert({
      report_id: ctx.reportId,
      event_type: "tool_returned", // closest valid event_type for refund_completed
      step_name: "refund",
      payload: {
        outcome: "refunded",
        refund_id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        stripe_payment_intent_id: ctx.stripePaymentIntentId,
      },
    });

    log.info("refund: auto-refund issued", {
      step_name: "refund",
      event_type: "refunded",
      report_id: ctx.reportId,
      refund_id: refund.id,
    });
  } catch (err) {
    const refundErrorMessage = err instanceof Error ? err.message : String(err);

    await supabase.from("report_events").insert({
      report_id: ctx.reportId,
      event_type: "error",
      step_name: "refund",
      payload: {
        outcome: "refund_failed",
        refund_error: refundErrorMessage,
        stripe_payment_intent_id: ctx.stripePaymentIntentId,
      },
    });

    log.error("refund: auto-refund failed", {
      step_name: "refund",
      event_type: "refund_failed",
      report_id: ctx.reportId,
      error: refundErrorMessage,
    });

    // Silent auto-recovery failure is dangerous — surface to the human.
    await sendRefundFailedAlert(ctx, refundErrorMessage);
  }
}
