import "server-only";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { log } from "@/lib/logger";
import { intentSchema } from "./steps/plan";
import { normalize } from "./steps/normalize";
import { parcel } from "./steps/parcel";
import { planAgent } from "./steps/plan";
import { gather } from "./steps/gather";
import { analyze } from "./steps/analyze";
import { depthDecide } from "./steps/depth";
import { generate } from "./steps/generate";
import { deliver } from "./steps/deliver";

/**
 * Main agent loop.
 *
 * Single Inngest function (`report.requested`) with eight semantic-named
 * `step.run` calls — one per SPEC §10 step. Each step.run is a checkpoint
 * Inngest persists, so any step can resume on failure without re-running
 * earlier steps.
 *
 * Pattern (i) per the PR3 design call. The semantic step names — "normalize",
 * "parcel", "plan", "gather", "analyze", "depth", "generate", "deliver" —
 * surface in Inngest's UI and matter for production debugging.
 *
 * SCAFFOLD STATE (PR3):
 *   - Each step.run wraps a stub that throws "not implemented".
 *   - This function is registered with the Inngest dev server via the
 *     /api/inngest webhook, but is never invoked in production today —
 *     USE_INNGEST_REPORTS stays false; the Stripe webhook continues to run
 *     summary.ts inline. PR5 wires the actual handoff.
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
    const { report_id } = data;

    log.info("orchestrator: starting agent loop", {
      report_id,
      step_name: "orchestrator",
      event_type: "agent_start",
    });

    // 1. Address normalization (deterministic, 5s budget)
    const normalized = await step.run("normalize", () =>
      normalize({ address: data.address })
    );

    // 2. Parcel resolution (deterministic, 5s budget)
    const parcelData = await step.run("parcel", () =>
      parcel({ normalized })
    );

    // 3. Planning (Sonnet, 3s budget)
    const plan = await step.run("plan", () =>
      planAgent({ normalized, parcel: parcelData, intent: data.intent })
    );

    // 4. Parallel tool calls (10-20s budget)
    const gathered = await step.run("gather", () =>
      gather({ plan, parcel: parcelData })
    );

    // 5. Analysis (Sonnet, 3-5s budget)
    const analysis = await step.run("analyze", () =>
      analyze({ gathered, parcel: parcelData, intent: data.intent })
    );

    // 6. Depth decision (10s budget, max 2 extra calls)
    const depth = await step.run("depth", () =>
      depthDecide({ analysis, gathered })
    );

    // 7. Report generation (Opus, 10-15s budget)
    const report = await step.run("generate", () => generate({ depth }));

    // 8. Persistence + delivery (5s budget)
    const delivered = await step.run("deliver", () =>
      deliver({ report_id, report })
    );

    log.info("orchestrator: agent loop complete", {
      report_id,
      step_name: "orchestrator",
      event_type: "agent_complete",
      status: delivered.status,
    });

    return delivered;
  }
);
