import { z } from "zod";

export const addressSchema = z.object({
  streetNumber: z
    .string()
    .min(1)
    .max(10)
    .regex(/^\d+[A-Za-z]?$/),
  streetName: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-zA-Z0-9\s.\-]+$/),
});

export const lookupInitiateSchema = z.object({
  address: z.string().min(5).max(200).trim(),
  report_type: z.enum(["standard", "attorney"]).default("standard"),
  address_components: z
    .object({
      streetNumber: z.string(),
      streetName: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
    })
    .optional(),
});

