import { z } from "zod";
import {
  getPropertyRecordsInputSchema,
  getPropertyRecordsOutputSchema,
} from "../schemas";

export type GetPropertyRecordsInput = z.infer<typeof getPropertyRecordsInputSchema>;
export type GetPropertyRecordsOutput = z.infer<typeof getPropertyRecordsOutputSchema>;

/**
 * SPEC §10 tool: county assessor lookup for ownership, square footage,
 * room counts, classification.
 *
 * Scaffold only — implementation lands in PR5+. Real impl extends the
 * existing Fulton County assessor scraper pattern; DeKalb/Cobb follow.
 */
export async function getPropertyRecords(
  input: GetPropertyRecordsInput
): Promise<GetPropertyRecordsOutput> {
  getPropertyRecordsInputSchema.parse(input);
  throw new Error("get_property_records: not implemented (PR3 scaffold)");
}
