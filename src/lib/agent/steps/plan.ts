import { z } from "zod";
import { normalizeOutputSchema } from "./normalize";
import { parcelOutputSchema } from "./parcel";

/**
 * SPEC §10 Step 3 — Planning (Sonnet 4.5, 3s budget).
 * Produces an investigation plan customized to property characteristics
 * and user intent. Prompt lives in /src/lib/agent/prompts/plan.ts.
 */

export const intentSchema = z.enum([
  "flip",
  "rental",
  "primary_residence",
  "portfolio_hold",
]);
export type Intent = z.infer<typeof intentSchema>;

/**
 * Default intent emitted on every `report.requested` event until the
 * lookup form is rebuilt to collect investor intent (post-MVP form
 * rebuild PR). Per D35: "flip" is the safe asymmetric default — its
 * planning bias toward unpermitted-work + open-permit-inheritance still
 * surfaces the right red flags on rental properties; the reverse misses
 * the most expensive failure modes.
 *
 * TODO(D35): replace with form-collected value when intent capture
 * ships. Single-line change at the import site once the form lands.
 */
export const DEFAULT_REPORT_INTENT: Intent = "flip";

export const planInputSchema = z.object({
  normalized: normalizeOutputSchema,
  parcel: parcelOutputSchema,
  intent: intentSchema,
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const planOutputSchema = z.object({
  priority_checks: z.array(z.string()),
  risk_signals_to_watch: z.array(z.string()),
  minimum_permit_lookback_years: z.number().int(),
  require_contractor_verification: z.boolean(),
  require_violation_check: z.boolean(),
  require_aerial_comparison: z.boolean(),
  estimated_complexity: z.enum(["low", "medium", "high"]),
});
export type PlanOutput = z.infer<typeof planOutputSchema>;

export async function planAgent(input: PlanInput): Promise<PlanOutput> {
  planInputSchema.parse(input);
  throw new Error("plan: not implemented (PR3 scaffold)");
}
