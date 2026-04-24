import type { PermitRecord } from "@/lib/accela";
import type { FootprintComparison, CodeViolation } from "../tools";
import type { PropertyFacts } from "../types";

export const ANALYSIS_SYSTEM_PROMPT = `You are the analysis module of PermitCheck's Diligence Agent. You have been given:
- Property facts (address, year built, square feet, type)
- Complete permit history
- Property records (ownership, sales, assessments)
- Code violation history (may be marked as not_available)
- Footprint comparison (current vs. permitted)

Produce a structured analysis as JSON with EXACTLY these fields:

{
  "executive_summary": "2-3 sentence plain-English summary of the property's permit health and overall risk",
  "risk_level": "low" | "medium" | "high",
  "permit_timeline": [ { "year": number, "summary": string } ],
  "red_flags": [
    {
      "category": "unpermitted_work" | "open_permit" | "expired_permit" | "code_violation" | "contractor_quality" | "ownership_pattern" | "incomplete_data",
      "severity": "critical" | "major" | "minor",
      "finding": string,
      "why_it_matters": string,
      "evidence": string
    }
  ],
  "green_signals": string[],
  "unpermitted_work_assessment": {
    "likelihood": "high" | "medium" | "low" | "none_detected" | "incomplete_data",
    "suspected_categories": string[],
    "evidence": string
  },
  "contractor_quality_score": number 1-10 or null,
  "questions_for_seller": string[],
  "recommended_next_steps": string[]
}

ANALYSIS GUIDELINES:

1. Unpermitted work detection
   - If assessor square footage exceeds permitted footprint by >15%, flag as CRITICAL.
   - If room count increased without permit record, flag as MAJOR.
   - Permits with status "Issued" but no finaled date >12 months old → MAJOR.
   - Expired permits for work that appears complete → MAJOR.

2. Open/expired permits
   - Any "Issued" permit with no final date for 12+ months = MAJOR. New owner inherits this liability.
   - Expired permits for visible work = MAJOR.

3. Code violations
   - When violations data is marked not_available, include a red_flag with category "incomplete_data" at severity "minor" noting the gap.
   - Open violations = CRITICAL.
   - Resolved within 24 months = MAJOR context.

4. Contractor quality
   - When contractor lookup is not_available, do NOT score high on quality.
   - License expired at time of permit = MAJOR.

5. Ownership patterns
   - Multiple sales within 24 months with permit gaps = investigate for flip hiding structural issues.

CITE EVIDENCE. Every red_flag must reference specific record numbers, dates, or field values. If you cannot cite evidence, do not make the claim — or use category "incomplete_data".

For a property with zero permits AND no property data AND not_available violations — your report should honestly reflect that data is incomplete, not assert a clean bill of health.

Respond with JSON only. No markdown, no commentary.`;

export interface AnalysisUserPromptData {
  facts: PropertyFacts;
  permits: PermitRecord[];
  permitsTruncated: boolean;
  usedFuzzyMatch: boolean;
  violations: CodeViolation[];
  violationsSource: "live_lookup" | "not_available";
  contractorLookups: Array<{ source: string; license_status: string; business_name: string | null }>;
  footprint: FootprintComparison | null;
}

export function buildAnalysisUserPrompt(data: AnalysisUserPromptData): string {
  const sortedPermits = [...data.permits].sort((a, b) => {
    const aDate = a.filedDate ?? "";
    const bDate = b.filedDate ?? "";
    return aDate.localeCompare(bDate);
  });

  const permitLines = sortedPermits.map((p) => ({
    record: p.recordNumber,
    type: p.type,
    status: p.status,
    filed: p.filedDate,
    issued: p.issuedDate,
    description: p.description?.slice(0, 200),
    inspections: p.inspections?.map((i) => ({
      type: i.inspectionType,
      result: i.result,
      date: i.inspectedDate,
    })),
  }));

  return [
    "PROPERTY FACTS:",
    JSON.stringify(data.facts, null, 2),
    "",
    `PERMITS (${sortedPermits.length} records${data.permitsTruncated ? ", TRUNCATED" : ""}${data.usedFuzzyMatch ? ", fuzzy-matched" : ""}):`,
    JSON.stringify(permitLines, null, 2),
    "",
    `CODE VIOLATIONS (source: ${data.violationsSource}):`,
    JSON.stringify(data.violations, null, 2),
    "",
    "CONTRACTOR LOOKUPS:",
    JSON.stringify(data.contractorLookups, null, 2),
    "",
    "FOOTPRINT COMPARISON:",
    JSON.stringify(data.footprint, null, 2),
  ].join("\n");
}
