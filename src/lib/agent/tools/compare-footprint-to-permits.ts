import { z } from "zod";
import type { PermitRecord } from "@/lib/accela";
import type { PropertyData } from "@/lib/property-data";
import type { ToolDefinition } from "./types";

export const compareFootprintInputSchema = z.object({
  parcel_id: z.string().nullable().optional(),
});

export interface FootprintComparison {
  recorded_sqft: number | null;
  latest_addition_permit: {
    record_number: string;
    filed_date: string | null;
    issued_date: string | null;
    type: string;
    description: string;
  } | null;
  addition_permit_count: number;
  unexplained_sqft_delta: number | null;
  discrepancy_severity: "none" | "minor" | "major" | "critical" | "unknown";
  notes: string[];
}

const ADDITION_KEYWORDS = /\b(addition|expand|convert|finish|build[- ]?out|enclose|garage conversion|basement finish)\b/i;
const COVERED_WORK = /\b(reroof|roof replace|roof repair|hvac|water heater|mechanical|service upgrade|panel upgrade)\b/i;

/**
 * Deterministic check. Compares assessor-recorded square footage and room
 * counts against the permitted additions on record. Flags when recorded
 * sqft exceeds permitted additions — a classic unpermitted-work signal.
 *
 * The caller passes the property and permit data through context; the
 * tool input is nominal (just the parcel for logging).
 */
export function buildCompareFootprintTool(opts: {
  getProperty: () => PropertyData | null;
  getPermits: () => PermitRecord[];
}): ToolDefinition<typeof compareFootprintInputSchema, FootprintComparison> {
  return {
    name: "compare_footprint_to_permits",
    description:
      "Compares recorded square footage against permitted additions. Flags unexplained growth that may indicate unpermitted work.",
    inputSchema: compareFootprintInputSchema,
    async execute() {
      const property = opts.getProperty();
      const permits = opts.getPermits();
      const notes: string[] = [];
      const recorded = property?.sqft ?? null;

      const additionPermits = permits.filter(
        (p) =>
          ADDITION_KEYWORDS.test(`${p.type} ${p.description}`) &&
          !COVERED_WORK.test(`${p.type} ${p.description}`)
      );

      const sortedAdditions = [...additionPermits].sort((a, b) => {
        const aDate = a.issuedDate ?? a.filedDate ?? "";
        const bDate = b.issuedDate ?? b.filedDate ?? "";
        return bDate.localeCompare(aDate);
      });

      const latest = sortedAdditions[0] ?? null;
      const hasAdditions = additionPermits.length > 0;

      // Core heuristic: older house + no addition permits = possible silent
      // unpermitted growth. We can't compute a real delta without baseline
      // sqft from a historical assessor record, but we can flag the absence.
      let severity: FootprintComparison["discrepancy_severity"] = "unknown";
      if (recorded == null) {
        notes.push("Recorded square footage not available from assessor.");
        severity = "unknown";
      } else if (!hasAdditions && (property?.yearBuilt ?? 9999) < 1980) {
        notes.push(
          `Property built ${property?.yearBuilt} with ${recorded.toLocaleString()} sqft and no addition permits on file. Older homes of this size without additions warrant verification.`
        );
        severity = "minor";
      } else {
        severity = "none";
      }

      // If we have finished-basement keywords in listings or property
      // type but no basement permit, that's a top claim driver — future
      // enhancement.

      return {
        recorded_sqft: recorded,
        latest_addition_permit: latest
          ? {
              record_number: latest.recordNumber,
              filed_date: latest.filedDate,
              issued_date: latest.issuedDate,
              type: latest.type,
              description: latest.description,
            }
          : null,
        addition_permit_count: additionPermits.length,
        unexplained_sqft_delta: null,
        discrepancy_severity: severity,
        notes,
      };
    },
  };
}
