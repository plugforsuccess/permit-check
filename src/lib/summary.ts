import type { Permit } from "@/types";
import type { PropertyData } from "./property-data";
import { formatPropertyContext, yearsSinceLastSale } from "./property-data";

/**
 * Zero Permit Edge Cases
 *
 * Property Type          | Expected Behavior           | Risk Level
 * ---------------------- | --------------------------- | ----------
 * Condo / unit           | No unit-level permits       | Low
 * Townhome (new build)   | No unit-level permits       | Low
 * New construction < 5yr | Builder permits only        | Low
 * Old SFH, no recent sale| May have pre-2000 permits   | Low/Medium
 * Recent SFH sale, no reno claims | Warrants follow-up | Medium
 * Recent SFH sale, claims renovation | RED FLAG       | High
 * Active complaint + 0 permits | RED FLAG             | High
 * Pre-2000 SFH, major reno claims | RED FLAG          | High
 */

export interface PermitSummary {
  riskLevel: "low" | "medium" | "high";
  verdict: string;
  summary: string;
  flags: string[];
  positives: string[];
  sellerQuestions: string[];
  listingNotes: string[];
}

/**
 * Generate an AI-powered permit summary using Claude.
 * Called once after payment — result stored in DB, not regenerated.
 */
export async function generatePermitSummary(
  permits: Permit[],
  address: string,
  propertyData?: PropertyData | null,
  listingDescription?: string | null,
  isUnit?: boolean,
  isDevelopmentPermit?: boolean,
): Promise<PermitSummary> {
  const permitData = permits.map((p) => ({
    record: p.record_number,
    type: p.type,
    status: p.status,
    filed: p.filed_date,
    description: p.description,
  }));

  const propertyContext = propertyData
    ? formatPropertyContext(propertyData)
    : "Property data not available";

  // Calculate years since last sale for flip detection
  const flipYears = propertyData ? yearsSinceLastSale(propertyData) : null;
  const flipSignal =
    flipYears !== null && flipYears <= 2
      ? `Property sold ${flipYears === 0 ? "less than 1 year" : flipYears + " year(s)"} ago — potential flip or recent investor acquisition.`
      : null;

  // Investor-owned signal
  const investorSignal =
    propertyData?.isInvestorOwned
      ? `ALERT: Property owned by ${propertyData.ownerName ?? "an LLC or investor"} — non-owner-occupied.`
      : null;

  const listingSection = listingDescription
    ? `\nListing description provided by user:\n"${listingDescription.slice(0, 1000)}"\n`
    : "\nNo listing description provided.\n";

  // Unit address context for condos/townhomes
  const unitContext = isUnit
    ? `
IMPORTANT — UNIT ADDRESS CONTEXT: This is a condo, townhome, or unit address. Permits for individual units are typically filed at the building or development level, not the unit level. Zero permits at the unit address is NORMAL and expected for condominiums and townhome communities. Do NOT flag zero unit-level permits as a red flag unless there is specific evidence of unpermitted work (e.g., a complaint filed at this specific unit address).
${isDevelopmentPermit ? "NOTE: The permits shown below were found at the base building address — these are development-level permits, not unit-specific permits." : "NOTE: No permits were found at the unit address OR the base building address."}
`
    : "";

  // New construction context
  const newConstructionContext =
    propertyData?.yearBuilt &&
    new Date().getFullYear() - propertyData.yearBuilt <= 5
      ? `
IMPORTANT — NEW CONSTRUCTION CONTEXT: This property was built in ${propertyData.yearBuilt} — ${new Date().getFullYear() - propertyData.yearBuilt} year(s) ago. New construction permits are typically filed under the developer or builder name, not the individual address. Zero permits at this address is EXPECTED for recently built properties. Do NOT flag as high risk unless there is a specific complaint or code violation on file.
`
      : "";

  // Zero permits decision tree
  const zeroPermitGuide =
    permits.length === 0
      ? `
ZERO PERMITS DECISION TREE — follow in order:

1. Is this a unit/condo/townhome address? (isUnit = ${isUnit})
   YES → LOW risk if no complaints exist. State that development-level
         permits are normal for this property type. Do not flag as risk.

2. Is this new construction (built within 5 years)?
   YES → LOW risk. Builder permits filed under developer name.
         State this explicitly. Do not flag as risk.

3. Is this a pre-2000 single family home with no recent sale?
   YES → LOW/MEDIUM risk. Normal for older properties.

4. Is this a single family home sold within 3 years AND listing claims renovation?
   YES → HIGH risk. Zero permits on a claimed renovation is the core red flag.

5. Is this a single family home sold within 3 years, no renovation claims?
   YES → MEDIUM risk. Recent sale warrants follow-up but is not alarming.

NEVER flag a condo/townhome/unit address as high risk purely due to zero permits.
NEVER flag new construction as high risk purely due to zero permits.
`
      : "";

  const prompt = `You are a senior real estate due diligence analyst. Your job is to give homebuyers a clear, direct verdict on permit records — not a cautious summary, but an actual recommendation.

Property: ${address}
Property context: ${propertyContext}
${flipSignal ? `ALERT: ${flipSignal}` : ""}
${investorSignal ? investorSignal : ""}
${unitContext}
${newConstructionContext}
Lookup date: ${new Date().toISOString().split("T")[0]}
Total permits found: ${permits.length}
${listingSection}
${zeroPermitGuide}
Permit records:
${JSON.stringify(permitData, null, 2)}

RULES:
1. NEVER use hedging language: no "may indicate", "could suggest", "it's possible that", "cannot be determined", "might mean". State facts directly.
2. Lead with the verdict — one sentence that tells the buyer exactly where they stand.
3. Cross-reference listing claims against permits. If listing says "renovated" but there are no renovation permits, say so explicitly.
4. Flag flips aggressively — if sold recently with no major permits, that's a red flag.
5. "Seller questions" must be specific and actionable — what should the buyer literally say to their agent or the seller?
6. If permits.length === 0 and property was recently sold or is listed as renovated, that is HIGH risk — zero permits on a claimed renovation is the core red flag PermitCheck exists to catch.
7. Duplicate permit records (same record number appearing multiple times) should be counted once.

Respond with a JSON object only, no markdown, no explanation:
{
  "riskLevel": "low" | "medium" | "high",
  "verdict": "Single sentence. Direct. Tells the buyer exactly where they stand. Example: 'HIGH RISK — This property has an open building complaint about unpermitted unit conversion and an expired plumbing permit that was never inspected.'",
  "summary": "2-3 sentences expanding on the verdict with specific details from the records. Include property context if relevant (year built, last sale price). No hedging.",
  "flags": ["Specific red flag with record number where applicable", "Another specific flag"],
  "positives": ["Specific positive signal", "Another positive"],
  "sellerQuestions": [
    "Why was permit [RECORD NUMBER] for [TYPE] filed in [YEAR] never finaled or inspected?",
    "What work was performed under the [YEAR] building complaint [RECORD NUMBER]?",
    "Can you provide documentation that the [TYPE] work was completed by a licensed contractor?"
  ],
  "listingNotes": ["Observation about listing vs permit records if listing description was provided", "Another observation"]
}

Risk level guide:
- low: All permits finaled or issued, no complaints, no expired permits, records consistent with property age and condition
- medium: 1-2 expired permits with no complaints, or minor issues that need follow-up but are not deal-breakers
- high: Any open building complaint, multiple expired permits, signs of unpermitted work, flip with no renovation permits, recent sale with major renovation claims but no permits`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text ?? "";

  try {
    const raw = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      riskLevel: raw.riskLevel ?? "medium",
      verdict: raw.verdict ?? raw.summary ?? "Summary unavailable.",
      summary: raw.summary ?? "",
      flags: Array.isArray(raw.flags) ? raw.flags : [],
      positives: Array.isArray(raw.positives) ? raw.positives : [],
      sellerQuestions: Array.isArray(raw.sellerQuestions)
        ? raw.sellerQuestions
        : [],
      listingNotes: Array.isArray(raw.listingNotes) ? raw.listingNotes : [],
    };
  } catch {
    return {
      riskLevel: "medium",
      verdict:
        "Summary generation failed. Please review permit records directly.",
      summary: "",
      flags: [],
      positives: [],
      sellerQuestions: [],
      listingNotes: [],
    };
  }
}
