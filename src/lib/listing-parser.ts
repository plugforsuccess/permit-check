/**
 * Extracts renovation and improvement claims from listing descriptions.
 * Used to cross-reference seller claims against permit records.
 */

export interface ListingClaim {
  type: string;        // Category: "Roof", "Kitchen", "Electrical", etc.
  claim: string;       // Verbatim or near-verbatim claim from listing
  permitTypes: string[]; // Expected permit types that should exist
  severity: "high" | "medium" | "low"; // How much a missing permit matters
}

// Keyword patterns mapped to permit types that should exist
const CLAIM_PATTERNS: Array<{
  regex: RegExp;
  type: string;
  permitTypes: string[];
  severity: "high" | "medium" | "low";
}> = [
  // Structural / major renovation
  {
    regex: /\b(new|replaced?|updated?|renovated?|remodeled?)\s+(roof|roofing|shingles?)\b/i,
    type: "Roof",
    permitTypes: ["Residential - Roofing", "Building", "Roofing"],
    severity: "high",
  },
  {
    regex: /\b(new|added?|finished?|converted?)\s+(room|bedroom|bathroom|bath|addition|adu|in-?law suite|garage conversion)\b/i,
    type: "Addition/Conversion",
    permitTypes: ["Residential - Addition", "Building", "Residential - Conversion"],
    severity: "high",
  },
  {
    regex: /\b(new|updated?|replaced?|rewired?|upgraded?)\s+(electrical|wiring|panel|service|circuit)\b/i,
    type: "Electrical",
    permitTypes: ["Residential - Electrical", "Electrical"],
    severity: "high",
  },
  {
    regex: /\b(new|updated?|replaced?|installed?)\s+(plumbing|pipes?|water heater|tankless|sewer)\b/i,
    type: "Plumbing",
    permitTypes: ["Residential - Plumbing", "Plumbing"],
    severity: "high",
  },
  {
    regex: /\b(new|updated?|replaced?|installed?)\s+(hvac|ac|heat pump|furnace|air condition|heating|cooling)\b/i,
    type: "HVAC",
    permitTypes: ["Residential - HVAC", "Mechanical"],
    severity: "high",
  },
  // Kitchen / bathrooms
  {
    regex: /\b(new|renovated?|remodeled?|updated?|gut)\s+kitchen\b/i,
    type: "Kitchen",
    permitTypes: ["Residential - Electrical", "Residential - Plumbing", "Building"],
    severity: "medium",
  },
  {
    regex: /\b(new|renovated?|remodeled?|updated?|gut)\s+(bathroom|bath|master bath)\b/i,
    type: "Bathroom",
    permitTypes: ["Residential - Plumbing", "Residential - Electrical"],
    severity: "medium",
  },
  // Windows / doors
  {
    regex: /\b(new|replaced?|updated?)\s+(windows?|doors?|sliding glass)\b/i,
    type: "Windows/Doors",
    permitTypes: ["Building", "Residential - Window"],
    severity: "low",
  },
  // Flooring / cosmetic (low severity — rarely permitted)
  {
    regex: /\b(new|replaced?|updated?|refinished?)\s+(floors?|flooring|hardwood|tile)\b/i,
    type: "Flooring",
    permitTypes: [],  // Flooring rarely requires permits
    severity: "low",
  },
  // General "renovated" / "updated" catch-all
  {
    regex: /\b(fully|completely|recently|newly|just)\s+(renovated?|remodeled?|updated?|redone)\b/i,
    type: "General Renovation",
    permitTypes: ["Building", "Residential - Electrical", "Residential - Plumbing"],
    severity: "high",
  },
  {
    regex: /\b(flip|flipped|investor special|move.?in ready after renovation)\b/i,
    type: "Investor Flip",
    permitTypes: ["Building", "Residential - Electrical", "Residential - Plumbing", "Residential - HVAC"],
    severity: "high",
  },
];

export function extractListingClaims(text: string): ListingClaim[] {
  if (!text || text.trim().length === 0) return [];

  const claims: ListingClaim[] = [];
  const seen = new Set<string>();

  for (const pattern of CLAIM_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match && !seen.has(pattern.type)) {
      seen.add(pattern.type);
      claims.push({
        type: pattern.type,
        claim: match[0],
        permitTypes: pattern.permitTypes,
        severity: pattern.severity,
      });
    }
  }

  return claims;
}

/**
 * Format extracted claims for inclusion in the AI prompt.
 * Creates a structured cross-reference table Claude can use directly.
 */
export function formatClaimsForPrompt(
  claims: ListingClaim[],
  permits: Array<{ type: string; status: string }>
): string {
  if (claims.length === 0) return "";

  const lines = claims.map((claim) => {
    const matchingPermits = claim.permitTypes.length > 0
      ? permits.filter((p) =>
          claim.permitTypes.some((pt) =>
            p.type.toLowerCase().includes(pt.toLowerCase().split(" - ")[1] ?? pt.toLowerCase())
          )
        )
      : [];

    const hasPermit = matchingPermits.length > 0;
    const permitStatus = hasPermit
      ? `PERMIT FOUND (${matchingPermits.map((p) => `${p.type} — ${p.status}`).join(", ")})`
      : claim.permitTypes.length === 0
      ? "NO PERMIT EXPECTED (cosmetic work)"
      : `NO PERMIT ON FILE — ${claim.severity.toUpperCase()} RISK`;

    return `- "${claim.claim}" → ${permitStatus}`;
  });

  return `\nLISTING CLAIM CROSS-REFERENCE:\n${lines.join("\n")}\n`;
}
