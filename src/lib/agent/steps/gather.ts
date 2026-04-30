import { z } from "zod";
import { planOutputSchema } from "./plan";
import { parcelOutputSchema } from "./parcel";
import {
  permitRecordSchema,
  propertyRecordSchema,
  contractorRecordSchema,
  codeViolationSchema,
  footprintComparisonSchema,
} from "../schemas";

/**
 * SPEC §10 Step 4 — Parallel tool calls (10–20s budget).
 * Initial dispatch via Promise.all over the six tools per the plan.
 */

export const gatherInputSchema = z.object({
  plan: planOutputSchema,
  parcel: parcelOutputSchema,
});
export type GatherInput = z.infer<typeof gatherInputSchema>;

export const gatherOutputSchema = z.object({
  permits: z.array(permitRecordSchema),
  property: propertyRecordSchema.nullable(),
  contractors: z.array(contractorRecordSchema),
  violations: z.array(codeViolationSchema),
  footprint: footprintComparisonSchema.nullable(),
});
export type GatherOutput = z.infer<typeof gatherOutputSchema>;

export async function gather(input: GatherInput): Promise<GatherOutput> {
  gatherInputSchema.parse(input);
  throw new Error("gather: not implemented (PR3 scaffold)");
}
