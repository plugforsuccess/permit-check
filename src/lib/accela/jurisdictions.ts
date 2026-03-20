export interface JurisdictionConfig {
  id: string;
  name: string;
  state: string;
  portalUrl: string;
  searchUrl: string;
  hasQuadrant: boolean; // NE/NW/SE/SW directional dropdown
  hasDateRange: boolean; // start/end date fields
  columnMap: {
    filedDate: number;
    recordNumber: number;
    recordType: number;
    description: number;
    permitName: number;
    status: number;
    address: number;
  };
}

export const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  ATLANTA_GA: {
    id: "ATLANTA_GA",
    name: "City of Atlanta",
    state: "GA",
    portalUrl: "https://aca-prod.accela.com/ATLANTA_GA",
    searchUrl:
      "https://aca-prod.accela.com/ATLANTA_GA/Cap/CapHome.aspx?module=Building&customglobalsearch=true",
    hasQuadrant: true,
    hasDateRange: true,
    columnMap: {
      filedDate: 1,
      recordNumber: 2,
      recordType: 3,
      description: 5,
      permitName: 6,
      status: 7,
      address: -1, // not in results table — use normalized input address
    },
  },

  GWINNETT_GA: {
    id: "GWINNETT_GA",
    name: "Gwinnett County",
    state: "GA",
    portalUrl: "https://aca-prod.accela.com/GWINNETT",
    searchUrl:
      "https://aca-prod.accela.com/GWINNETT/Cap/CapHome.aspx?module=Building",
    hasQuadrant: false,
    hasDateRange: false,
    columnMap: {
      filedDate: 1,
      recordNumber: 2,
      recordType: 3,
      description: 4, // Project Name
      permitName: 3, // no separate permit name — use record type
      status: 5,
      address: 8,
    },
  },
};

export function getJurisdiction(id: string): JurisdictionConfig {
  const j = JURISDICTIONS[id];
  if (!j) throw new Error(`Unknown jurisdiction: ${id}`);
  return j;
}

/**
 * Detect jurisdiction from a normalized address.
 * Currently detects Atlanta city limits vs Gwinnett County by zip code.
 * Expand this as more jurisdictions are added.
 */
export function detectJurisdiction(normalizedAddress: string): string {
  const upper = normalizedAddress.toUpperCase();

  // Gwinnett County zip codes
  const gwinnettZips = [
    "30004", "30005", "30017", "30019", "30024", "30040", "30041",
    "30043", "30044", "30045", "30046", "30047", "30052", "30078",
    "30084", "30087", "30092", "30093", "30096", "30097",
  ];

  // Atlanta city zip codes
  const atlantaZips = [
    "30301", "30302", "30303", "30304", "30305", "30306", "30307",
    "30308", "30309", "30310", "30311", "30312", "30313", "30314",
    "30315", "30316", "30317", "30318", "30319", "30324", "30326",
    "30327", "30328", "30329", "30331", "30332", "30334", "30336",
    "30338", "30339", "30340", "30341", "30342", "30344", "30345",
    "30346", "30349", "30350", "30354", "30360", "30363", "30368",
  ];

  // Check for zip code in address
  const zipMatch = upper.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    if (gwinnettZips.includes(zip)) return "GWINNETT_GA";
    if (atlantaZips.includes(zip)) return "ATLANTA_GA";
  }

  // Default to Atlanta if no zip or unrecognized
  return "ATLANTA_GA";
}
