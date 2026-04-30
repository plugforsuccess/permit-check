import { z } from "zod";
import { depthOutputSchema } from "./depth";

/**
 * SPEC §10 Step 7 — Report generation (Opus 4.7, 10-15s budget).
 * Produces the final report in HTML (web) and Markdown (PDF) from the
 * structured analysis. Uses Anthropic SDK structured outputs (JSON mode).
 */

export const generateInputSchema = z.object({
  depth: depthOutputSchema,
});
export type GenerateInput = z.infer<typeof generateInputSchema>;

export const generateOutputSchema = z.object({
  report_html: z.string(),
  report_markdown: z.string(),
  report_json: z.unknown(), // canonical structured form, persisted to reports.report_json
});
export type GenerateOutput = z.infer<typeof generateOutputSchema>;

export async function generate(input: GenerateInput): Promise<GenerateOutput> {
  generateInputSchema.parse(input);
  throw new Error("generate: not implemented (PR3 scaffold)");
}
