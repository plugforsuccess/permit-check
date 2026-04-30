/**
 * Zod schemas for the six agent tools described in SPEC §10.
 *
 * Every tool takes a Zod-validated input and returns a Zod-validated output —
 * see CLAUDE.md "The agent boundary" rule #2: "Every tool input and output is
 * Zod-validated. Return structured errors so the model can self-correct."
 *
 * The tool implementations live in /src/lib/agent/tools/ and currently throw
 * "Not implemented" — PR3 ships the scaffold; real implementations land in
 * PR5+.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Supported jurisdictions per D3. */
export const jurisdictionSchema = z.enum([
  "atlanta",
  "gwinnett",
  "dekalb",
  "fulton",
  "cobb",
]);
export type Jurisdiction = z.infer<typeof jurisdictionSchema>;

// ---------------------------------------------------------------------------
// Tool: search_permits
// ---------------------------------------------------------------------------

export const searchPermitsInputSchema = z.object({
  parcel_id: z.string().optional(),
  address: z.string().optional(),
  jurisdiction: jurisdictionSchema,
  lookback_years: z.number().int().min(1).max(100).default(25),
});

export const permitRecordSchema = z.object({
  permit_id: z.string(),
  permit_type: z.string(),
  work_description: z.string().nullable(),
  applicant_name: z.string().nullable(),
  contractor_name: z.string().nullable(),
  contractor_license: z.string().nullable(),
  issued_date: z.string().nullable(), // ISO date
  finaled_date: z.string().nullable(),
  expiration_date: z.string().nullable(),
  status: z.string(),
  valuation: z.number().nullable(),
});

export const searchPermitsOutputSchema = z.object({
  permits: z.array(permitRecordSchema),
});

// ---------------------------------------------------------------------------
// Tool: get_property_records
// ---------------------------------------------------------------------------

export const getPropertyRecordsInputSchema = z.object({
  parcel_id: z.string(),
  jurisdiction: jurisdictionSchema,
});

export const propertyRecordSchema = z.object({
  parcel_id: z.string(),
  jurisdiction: jurisdictionSchema,
  year_built: z.number().int().nullable(),
  square_feet: z.number().int().nullable(),
  property_type: z.string().nullable(),
  ownership_history: z.array(
    z.object({
      owner_name: z.string(),
      sale_date: z.string().nullable(),
      sale_price: z.number().nullable(),
    })
  ),
  assessed_value: z.number().nullable(),
  room_count: z.number().int().nullable(),
});

export const getPropertyRecordsOutputSchema = propertyRecordSchema;

// ---------------------------------------------------------------------------
// Tool: get_contractor_record
// ---------------------------------------------------------------------------

export const getContractorRecordInputSchema = z
  .object({
    license_number: z.string().optional(),
    business_name: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.license_number) || Boolean(v.business_name),
    "Must provide license_number or business_name"
  );

export const contractorRecordSchema = z.object({
  license_number: z.string().nullable(),
  business_name: z.string().nullable(),
  license_status: z.enum(["active", "expired", "revoked", "unknown"]),
  expiration_date: z.string().nullable(),
  disciplinary_actions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      severity: z.enum(["minor", "major", "critical"]),
    })
  ),
  complaint_count: z.number().int(),
});

export const getContractorRecordOutputSchema = contractorRecordSchema;

// ---------------------------------------------------------------------------
// Tool: get_code_violations
// ---------------------------------------------------------------------------

export const getCodeViolationsInputSchema = z.object({
  address: z.string(),
  jurisdiction: jurisdictionSchema,
});

export const codeViolationSchema = z.object({
  violation_id: z.string(),
  date: z.string(),
  description: z.string(),
  resolution_status: z.enum(["open", "resolved", "in_progress", "unknown"]),
  associated_fines: z.number().nullable(),
});

export const getCodeViolationsOutputSchema = z.object({
  violations: z.array(codeViolationSchema),
});

// ---------------------------------------------------------------------------
// Tool: compare_footprint_to_permits
// ---------------------------------------------------------------------------

export const compareFootprintInputSchema = z.object({
  parcel_id: z.string(),
  jurisdiction: jurisdictionSchema,
});

export const footprintComparisonSchema = z.object({
  current_square_feet: z.number().int().nullable(),
  permitted_square_feet: z.number().int().nullable(),
  delta_square_feet: z.number().int().nullable(),
  delta_percent: z.number().nullable(),
  current_room_count: z.number().int().nullable(),
  permitted_room_count: z.number().int().nullable(),
  unpermitted_categories_suspected: z.array(z.string()),
  evidence_refs: z.array(z.string()),
});

export const compareFootprintOutputSchema = footprintComparisonSchema;

// ---------------------------------------------------------------------------
// Tool: get_permit_document (selective, expensive)
// ---------------------------------------------------------------------------

export const getPermitDocumentInputSchema = z.object({
  permit_id: z.string(),
});

export const permitDocumentSchema = z.object({
  permit_id: z.string(),
  extracted_text: z.string(),
  page_count: z.number().int(),
  source_url: z.string().nullable(),
});

export const getPermitDocumentOutputSchema = permitDocumentSchema;
