import { z } from "zod";

/**
 * SPEC §10 Step 1 — Address normalization (deterministic, no LLM).
 * 5s budget. Google Places (New) Text Search.
 */

export const normalizeInputSchema = z.object({
  address: z.string().min(5).max(200),
});
export type NormalizeInput = z.infer<typeof normalizeInputSchema>;

export const normalizeOutputSchema = z.object({
  raw_address: z.string(),
  normalized_address: z.string(),
  google_place_id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  jurisdiction: z.enum(["atlanta", "gwinnett", "dekalb", "fulton", "cobb"]),
});
export type NormalizeOutput = z.infer<typeof normalizeOutputSchema>;

export async function normalize(input: NormalizeInput): Promise<NormalizeOutput> {
  normalizeInputSchema.parse(input);
  throw new Error("normalize: not implemented (PR3 scaffold)");
}
