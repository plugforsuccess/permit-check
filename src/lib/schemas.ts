import { z } from "zod";

/** UUID v4 format regex for route parameter validation. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a single inspection record from a detail page. */
const inspectionRecordSchema = z.object({
  inspectionType: z.string(),
  scheduledDate: z.string().nullable(),
  inspectedDate: z.string().nullable(),
  result: z.enum(["Passed", "Failed", "Pending", "Canceled", "Unknown"]),
  inspector: z.string().nullable(),
  comments: z.string().nullable(),
});

/** Validates scraped permit data before DB insertion. */
export const scrapedPermitSchema = z.object({
  recordNumber: z.string().min(1).max(50),
  type: z.string().max(200).default("Unknown"),
  status: z.enum(["Issued", "Finaled", "Expired", "Void", "In Review", "Unknown"]),
  filedDate: z.string().nullable(),
  issuedDate: z.string().nullable(),
  description: z.string().max(500).default(""),
  address: z.string().max(300).default(""),
  inspections: z.array(inspectionRecordSchema).optional(),
});

/** Validates AI-generated permit summary after JSON.parse. */
export const permitSummarySchema = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  verdict: z.string().max(300),
  summary: z.string().max(1000),
  flags: z.array(z.string().max(300)),
  positives: z.array(z.string().max(300)),
  sellerQuestions: z.array(z.string().max(300)),
  listingNotes: z.array(z.string().max(300)),
});

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

