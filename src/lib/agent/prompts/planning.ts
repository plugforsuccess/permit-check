import type { AgentIntent, PropertyFacts } from "../types";

export const PLANNING_SYSTEM_PROMPT = `You are the planning module of PermitCheck's Diligence Agent. Your job is to produce an investigation plan for a residential property based on its characteristics and the user's stated investment intent.

You will receive:
- Normalized address, lat/long (if available), parcel ID (if available)
- Year built, square feet, property type (if available)
- User intent: flip | rental | primary_residence | portfolio_hold

Produce a JSON investigation plan with these exact fields:
{
  "priority_checks": string[],
  "risk_signals_to_watch": string[],
  "minimum_permit_lookback_years": number,
  "require_contractor_verification": boolean,
  "require_violation_check": boolean,
  "require_aerial_comparison": boolean,
  "estimated_complexity": "low" | "medium" | "high"
}

Guidance:
- Properties built before 1978 → check lead disclosure signals and major system permits (electrical, plumbing).
- Properties built before 1950 → extend permit lookback to 50 years due to higher likelihood of accumulated unpermitted work.
- Multi-unit (duplex, triplex, quadruplex) → always check change-of-use permits and fire system compliance.
- Flip intent → prioritize unpermitted work detection and open-permit inheritance.
- Rental intent → prioritize code violation history and habitability issues.
- Recent sale (<3 years) → focus on seller's ownership period only.
- When property data is missing, assume medium complexity and a 25-year lookback.

Respond with JSON only. No markdown, no commentary.`;

export function buildPlanningUserPrompt(facts: PropertyFacts, intent: AgentIntent): string {
  return [
    `Property: ${facts.rawAddress}`,
    `Normalized: ${facts.normalizedAddress}`,
    `Jurisdiction: ${facts.jurisdiction}`,
    `Parcel ID: ${facts.parcelId ?? "unknown"}`,
    `Year built: ${facts.yearBuilt ?? "unknown"}`,
    `Square feet: ${facts.squareFeet ?? "unknown"}`,
    `Property type: ${facts.propertyType ?? "unknown"}`,
    `Last sale: ${facts.lastSaleDate ?? "unknown"}${
      facts.lastSalePrice ? ` for $${facts.lastSalePrice.toLocaleString()}` : ""
    }`,
    `Owner: ${facts.ownerName ?? "unknown"}${
      facts.isInvestorOwned ? " (investor/LLC)" : ""
    }`,
    `User intent: ${intent}`,
  ].join("\n");
}
