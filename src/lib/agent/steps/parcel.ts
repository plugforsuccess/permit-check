import { z } from "zod";
import { normalizeOutputSchema } from "./normalize";

/**
 * SPEC §10 Step 2 — Parcel resolution (deterministic).
 * 5s budget. County assessor lookup.
 */

export const parcelInputSchema = z.object({
  normalized: normalizeOutputSchema,
});
export type ParcelInput = z.infer<typeof parcelInputSchema>;

export const parcelOutputSchema = z.object({
  parcel_id: z.string(),
  year_built: z.number().int().nullable(),
  square_feet: z.number().int().nullable(),
  property_type: z.string().nullable(),
});
export type ParcelOutput = z.infer<typeof parcelOutputSchema>;

export async function parcel(input: ParcelInput): Promise<ParcelOutput> {
  parcelInputSchema.parse(input);
  throw new Error("parcel: not implemented (PR3 scaffold)");
}
