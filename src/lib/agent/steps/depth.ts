import { z } from "zod";
import { analyzeOutputSchema } from "./analyze";
import { gatherOutputSchema } from "./gather";

/**
 * SPEC §10 Step 6 — Depth decision (10s budget, max 2 extra tool calls).
 * Decides whether to pull additional records (e.g. permit PDFs) or proceed
 * to report generation with what we have.
 */

export const depthInputSchema = z.object({
  analysis: analyzeOutputSchema,
  gathered: gatherOutputSchema,
});
export type DepthInput = z.infer<typeof depthInputSchema>;

export const depthOutputSchema = z.object({
  additional_calls_made: z.number().int().min(0).max(2),
  additional_findings: z.array(z.string()),
  // The (possibly enriched) analysis returned to step 7.
  analysis: analyzeOutputSchema,
});
export type DepthOutput = z.infer<typeof depthOutputSchema>;

export async function depthDecide(input: DepthInput): Promise<DepthOutput> {
  depthInputSchema.parse(input);
  throw new Error("depth: not implemented (PR3 scaffold)");
}
