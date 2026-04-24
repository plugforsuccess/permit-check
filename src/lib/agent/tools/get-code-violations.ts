import { z } from "zod";
import type { ToolDefinition } from "./types";

export const getCodeViolationsInputSchema = z.object({
  address: z.string().min(1),
  jurisdiction: z.enum(["ATLANTA_GA", "GWINNETT_GA"]).default("ATLANTA_GA"),
});

export interface CodeViolation {
  violation_id: string;
  date: string | null;
  description: string;
  status: "open" | "resolved" | "unknown";
  fine_amount: number | null;
}

export interface GetCodeViolationsOutput {
  violations: CodeViolation[];
  source: "live_lookup" | "not_available";
  note?: string;
}

/**
 * Stub. Atlanta routes code enforcement through the same Accela instance
 * (Code Enforcement module). Wiring pending — the scraper currently only
 * enables the Building module. Returns an empty result tagged
 * `not_available` so the analysis prompt can flag missing data honestly
 * instead of silently treating zero violations as a clean record.
 */
export function buildGetCodeViolationsTool(): ToolDefinition<
  typeof getCodeViolationsInputSchema,
  GetCodeViolationsOutput
> {
  return {
    name: "get_code_violations",
    description:
      "Searches code enforcement and housing violation records for the property. Returns violations with date, description, resolution status, and associated fines.",
    inputSchema: getCodeViolationsInputSchema,
    async execute() {
      return {
        violations: [],
        source: "not_available",
        note:
          "Code enforcement module not yet wired. Record as incomplete_data rather than absence of violations.",
      };
    },
  };
}
