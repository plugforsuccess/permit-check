import { z } from "zod";
import { gatherOutputSchema } from "./gather";
import { parcelOutputSchema } from "./parcel";
import { intentSchema } from "./plan";

/**
 * SPEC §10 Step 5 — Analysis (Sonnet 4.5, 3-5s budget).
 * Produces structured findings with required `evidence_refs` per red flag.
 */

export const analyzeInputSchema = z.object({
  gathered: gatherOutputSchema,
  parcel: parcelOutputSchema,
  intent: intentSchema,
});
export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

export const redFlagSchema = z.object({
  category: z.enum([
    "unpermitted_work",
    "open_permit",
    "expired_permit",
    "code_violation",
    "contractor_quality",
    "ownership_pattern",
  ]),
  severity: z.enum(["critical", "major", "minor"]),
  finding: z.string(),
  why_it_matters: z.string(),
  evidence_refs: z.array(z.string()).min(1, "Every red flag must cite evidence"),
});
export type RedFlag = z.infer<typeof redFlagSchema>;

export const analyzeOutputSchema = z.object({
  executive_summary: z.string(),
  risk_level: z.enum(["low", "medium", "high"]),
  permit_timeline: z.array(
    z.object({
      year: z.number().int(),
      summary: z.string(),
    })
  ),
  red_flags: z.array(redFlagSchema),
  green_signals: z.array(z.string()),
  unpermitted_work_assessment: z.object({
    likelihood: z.enum(["high", "medium", "low", "none_detected"]),
    suspected_categories: z.array(z.string()),
    evidence_refs: z.array(z.string()),
  }),
  contractor_quality_score: z.number().min(1).max(10),
  questions_for_seller: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
});
export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;

export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  analyzeInputSchema.parse(input);
  throw new Error("analyze: not implemented (PR3 scaffold)");
}
