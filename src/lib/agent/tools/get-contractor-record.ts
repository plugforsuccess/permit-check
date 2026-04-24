import { z } from "zod";
import type { ToolDefinition } from "./types";

export const getContractorRecordInputSchema = z
  .object({
    license_number: z.string().optional(),
    business_name: z.string().optional(),
  })
  .refine((v) => !!(v.license_number || v.business_name), {
    message: "Provide license_number or business_name",
  });

export interface ContractorRecord {
  license_number: string | null;
  business_name: string | null;
  license_status: "active" | "expired" | "revoked" | "unknown";
  disciplinary_actions: number;
  complaints: number;
  source: "ga_sos" | "not_available";
}

/**
 * Stub. GA Secretary of State licensing lookup is a future build.
 * Returns source="not_available" so the analyzer treats missing
 * contractor data as incomplete evidence, not as a green signal.
 */
export function buildGetContractorRecordTool(): ToolDefinition<
  typeof getContractorRecordInputSchema,
  ContractorRecord
> {
  return {
    name: "get_contractor_record",
    description:
      "Looks up a contractor by GA license number or business name. Returns license status, disciplinary actions, and complaint count.",
    inputSchema: getContractorRecordInputSchema,
    async execute(input) {
      return {
        license_number: input.license_number ?? null,
        business_name: input.business_name ?? null,
        license_status: "unknown",
        disciplinary_actions: 0,
        complaints: 0,
        source: "not_available",
      };
    },
  };
}
