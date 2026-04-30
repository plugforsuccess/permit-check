import { z } from "zod";
import {
  searchPermitsInputSchema,
  searchPermitsOutputSchema,
} from "../schemas";

export type SearchPermitsInput = z.infer<typeof searchPermitsInputSchema>;
export type SearchPermitsOutput = z.infer<typeof searchPermitsOutputSchema>;

/**
 * SPEC §10 tool: search permit records for a property.
 *
 * Scaffold only — implementation lands in PR5+ when this tool is wired into
 * the agent loop. Real impl reads from the per-property cache (post-PR4
 * `properties` + `permits_v2` tables) and falls through to the live scraper
 * (lib/accela/scraper.ts) on cache miss / TTL expiry.
 */
export async function searchPermits(
  input: SearchPermitsInput
): Promise<SearchPermitsOutput> {
  // Validate input — surfaces a structured error the model can self-correct.
  searchPermitsInputSchema.parse(input);
  throw new Error("search_permits: not implemented (PR3 scaffold)");
}
