import "server-only";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { log } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { intentSchema } from "./steps/plan";
import { normalize } from "./steps/normalize";
import { parcel } from "./steps/parcel";
import { planAgent } from "./steps/plan";
import { gather } from "./steps/gather";
import { analyze } from "./steps/analyze";
import { depthDecide } from "./steps/depth";
import { generate } from "./steps/generate";
import { deliver } from "./steps/deliver";
import { handleAgentFailure } from "./refund";

/**
 * Main agent loop.
 *
 * Single Inngest function (`report.requested`) with eight semantic-named
 * `step.run` calls — one per SPEC §10 step. Each step.run is a checkpoint
 * Inngest persists, so any step can resume on failure without re-running
 * earlier steps.
 *
 * STATE (PR6):
 *   - Steps 1 (normalize) + 2 (parcel) are real implementations.
 *   - Steps 3-8 (plan, gather, analyze, depth, generate, deliver) still
 *     throw "not implemented" from PR3. Real impls land in PR9-PR12.
 *
 * Audit logging:
 *   Each step.run wraps its work in `report_events` start/complete
 *   inserts. On step success, the step_completed event's `payload` field
 *   carries the step's typed output (NormalizeOutput, ParcelOutput,
 *   etc.). Per Cameron's PR6 guidance: report_json stays end-only
 *   (populated only by the generate step); per-step debuggability lives
 *   in report_events.payload. Consumers of report_json can assume any
 *   non-null value is the final structured report.
 *
 * Failure handling (per CLAUDE.md "Errors" + Cameron's PR6 spec):
 *   The whole handler body runs inside try/catch. On any uncaught error
 *   from a step.run, `handleAgentFailure` from `./refund.ts` runs:
 *     1. Marks reports_v2 status='failed' with error_message + completed_at
 *     2. Logs report_events with event_type='error' (step_name = the
 *        step that threw)
 *     3. Calls stripe.refunds.create with idempotency_key=reports_v2.id
 *     4. On refund success: report_events 'tool_returned' (refunded payload)
 *     5. On refund failure: report_events 'error' (refund_failed payload)
 *        AND a Resend email alert to HEALTH_CHECK_ALERT_EMAIL
 *   The error is re-thrown after handleAgentFailure so Inngest marks the
 *   function failed in its dashboard.
 */

export const reportRequestedEventSchema = z.object({
  report_id: z.string().uuid(),
  address: z.string().min(5).max(200),
  intent: intentSchema,
});
export type ReportRequestedEvent = z.infer<typeof reportRequestedEventSchema>;

export const reportRequested = inngest.createFunction(
  {
    id: "report-requested",
    name: "Generate diligence report",
    triggers: [{ event: "report.requested" }],
  },
  async ({ event, step }) => {
    const data = reportRequestedEventSchema.parse(event.data);
    const { report_id, address, intent } = data;

    log.info("orchestrator: starting agent loop", {
      report_id,
      step_name: "orchestrator",
      event_type: "agent_start",
    });

    const supabase = getSupabaseAdmin();

    // Fetch enough of the reports_v2 row to give the failure handler the
    // payment-intent context it needs for Stripe refund.
    const { data: reportRow, error: rowFetchErr } = await supabase
      .from("reports_v2")
      .select("stripe_payment_intent_id")
      .eq("id", report_id)
      .single();

    if (rowFetchErr || !reportRow) {
      // PR5's webhook should have inserted this row before emitting the
      // event. If it's missing, something is badly wrong — there's no
      // row to mark failed and no payment intent to refund. Log and
      // throw to fail the Inngest function.
      log.error("orchestrator: reports_v2 row not found at entry", {
        report_id,
        error: rowFetchErr?.message,
        step_name: "orchestrator",
        event_type: "row_missing",
      });
      throw new Error(
        `reports_v2 row ${report_id} not found at orchestrator entry`,
      );
    }

    const stripePaymentIntentId = reportRow.stripe_payment_intent_id ?? null;

    // Closure variable tracking the active step name for the failure
    // handler's `failedStepName` field. Updated before each step.run.
    let currentStepName = "init";

    /**
     * Wrap a step's work with report_events start/complete inserts. The
     * inserts run inside step.run so they stay tied to the step's
     * Inngest checkpoint — they re-execute if Inngest retries the step.
     * That produces multiple step_started events on retry by design;
     * the audit log is append-only and the duplicate is itself a useful
     * signal.
     */
    const runStep = async <T>(
      name: string,
      fn: () => Promise<T>,
    ): Promise<T> => {
      currentStepName = name;
      // Inngest's step.run serializes the return value through Jsonify,
      // which TS can't narrow back to T generically. Cast at the
      // boundary — the runtime shape is identical because step return
      // values are already JSON-shaped data (from Zod-validated step
      // outputs).
      const result = (await step.run(name, async () => {
        const sb = getSupabaseAdmin();
        await sb.from("report_events").insert({
          report_id,
          event_type: "step_started",
          step_name: name,
        });
        const stepResult = await fn();
        await sb.from("report_events").insert({
          report_id,
          event_type: "step_completed",
          step_name: name,
          payload: stepResult as Record<string, unknown>,
        });
        return stepResult;
      })) as T;
      return result;
    };

    try {
      // Status enum (SPEC §11) is coarse-grained. Multi-step phases
      // share one status string. Updates are idempotent so re-execution
      // on Inngest retry is harmless.
      await supabase
        .from("reports_v2")
        .update({ status: "normalizing", started_at: new Date().toISOString() })
        .eq("id", report_id);

      // 1. Address normalization (Google Places, 5s budget).
      const normalized = await runStep("normalize", () =>
        normalize({ address }),
      );

      // 2. Parcel resolution (REAPI + properties UPSERT, 5s budget).
      const parcelData = await runStep("parcel", () => parcel({ normalized }));

      // 3. Planning (Sonnet, 3s budget). PR6 stub still throws.
      const plan = await runStep("plan", () =>
        planAgent({ normalized, parcel: parcelData, intent }),
      );

      // 4. Parallel tool calls (10-20s budget).
      await supabase
        .from("reports_v2")
        .update({ status: "gathering" })
        .eq("id", report_id);
      const gathered = await runStep("gather", () =>
        gather({ plan, parcel: parcelData }),
      );

      // 5. Analysis (Sonnet, 3-5s budget).
      await supabase
        .from("reports_v2")
        .update({ status: "analyzing" })
        .eq("id", report_id);
      const analysis = await runStep("analyze", () =>
        analyze({ gathered, parcel: parcelData, intent }),
      );

      // 6. Depth decision (10s budget, max 2 extra calls).
      const depth = await runStep("depth", () =>
        depthDecide({ analysis, gathered }),
      );

      // 7. Report generation (Opus, 10-15s budget).
      await supabase
        .from("reports_v2")
        .update({ status: "generating" })
        .eq("id", report_id);
      const report = await runStep("generate", () => generate({ depth }));

      // 8. Persistence + delivery (5s budget).
      const delivered = await runStep("deliver", () =>
        deliver({ report_id, report }),
      );

      log.info("orchestrator: agent loop complete", {
        report_id,
        step_name: "orchestrator",
        event_type: "agent_complete",
        status: delivered.status,
      });

      return delivered;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      log.error("orchestrator: step failed, running auto-refund handler", {
        report_id,
        step_name: currentStepName,
        event_type: "agent_failure",
        error: errorMessage,
      });

      await handleAgentFailure({
        reportId: report_id,
        stripePaymentIntentId,
        failedStepName: currentStepName,
        errorMessage,
      });

      // Re-throw so Inngest marks the function failed in its dashboard.
      // The reports_v2 row is already updated to 'failed' inside
      // handleAgentFailure; the throw is purely for Inngest's view.
      throw err;
    }
  },
);
