import type { Permit } from "@/types";
import type { PropertyData } from "./property-data";
import { formatPropertyContext, yearsSinceLastSale } from "./property-data";

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

  const prompt = `You are a senior real estate due diligence analyst. Your job is to give homebuyers a clear, direct verdict on permit records — not a cautious summary, but an actual recommendation.

Property: ${address}
Property context: ${propertyContext}
${flipSignal ? `ALERT: ${flipSignal}` : ""}
${investorSignal ? investorSignal : ""}
Lookup date: ${new Date().toISOString().split("T")[0]}
Total permits found: ${permits.length}
${listingSection}
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
- high: Any open building complaint, multiple expired permits, signs of unpermitted work, flip with no renovation permits, recent sale with major renovation claims but no permits

Zero permits guide:
- Old property (20+ years), no recent sale, no renovation claims → low/medium (normal for older properties)
- Recent sale (< 3 years) OR listing claims renovation → HIGH (zero permits on a claimed renovation is a red flag)
- Recent complaint or code violation with zero permits → HIGH`;

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
