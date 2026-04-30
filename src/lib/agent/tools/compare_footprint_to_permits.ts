import { z } from "zod";
import {
  compareFootprintInputSchema,
  compareFootprintOutputSchema,
} from "../schemas";

export type CompareFootprintInput = z.infer<typeof compareFootprintInputSchema>;
export type CompareFootprintOutput = z.infer<typeof compareFootprintOutputSchema>;

/**
 * SPEC §10 tool: compare assessor square footage / room count against the
 * sum of permitted changes. Surfaces unpermitted additions or remodels.
 *
 * Scaffold only — implementation lands in PR5+. Real impl is deterministic
 * math on the outputs of search_permits + get_property_records.
 */
export async function compareFootprintToPermits(
  input: CompareFootprintInput
): Promise<CompareFootprintOutput> {
  compareFootprintInputSchema.parse(input);
  throw new Error("compare_footprint_to_permits: not implemented (PR3 scaffold)");
}
