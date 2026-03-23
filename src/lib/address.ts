/**
 * Address normalization utilities.
 * In production, integrate Google Maps Geocoding API for robust normalization.
 * This provides basic normalization for MVP.
 */

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: "ST",
  st: "ST",
  avenue: "AVE",
  ave: "AVE",
  boulevard: "BLVD",
  blvd: "BLVD",
  drive: "DR",
  dr: "DR",
  road: "RD",
  rd: "RD",
  lane: "LN",
  ln: "LN",
  court: "CT",
  ct: "CT",
  circle: "CIR",
  cir: "CIR",
  place: "PL",
  pl: "PL",
  way: "WAY",
  terrace: "TER",
  ter: "TER",
  trail: "TRL",
  trl: "TRL",
  parkway: "PKWY",
  pkwy: "PKWY",
  highway: "HWY",
  hwy: "HWY",
};

const DIRECTION_ABBREVIATIONS: Record<string, string> = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  northeast: "NE",
  northwest: "NW",
  southeast: "SE",
  southwest: "SW",
  n: "N",
  s: "S",
  e: "E",
  w: "W",
  ne: "NE",
  nw: "NW",
  se: "SE",
  sw: "SW",
};

export function normalizeAddress(raw: string): string {
  let address = raw.trim().toUpperCase();

  // Remove apartment/unit/suite info for permit lookup
  address = address.replace(
    /\s*(APT|UNIT|STE|SUITE|#)\s*\.?\s*\w+\s*$/i,
    ""
  );

  // Remove ", USA" or ", United States" suffix (Google Places appends this)
  address = address.replace(/,?\s*(USA|UNITED STATES)\s*$/i, "");

  // Remove city, state, zip — any city (not just Atlanta)
  // Matches: ", Atlanta, GA 30309" or ", Lawrenceville, GA 30046" etc.
  address = address.replace(/,?\s*[A-Z\s]+,?\s*(GA|GEORGIA)\s*\d{0,5}\s*$/i, "");

  // Remove any trailing comma
  address = address.replace(/,\s*$/, "").trim();

  // Normalize street type abbreviations
  const words = address.split(/\s+/);
  const normalized = words.map((word) => {
    const lower = word.toLowerCase().replace(/\.$/, "");
    if (STREET_ABBREVIATIONS[lower]) {
      return STREET_ABBREVIATIONS[lower];
    }
    if (DIRECTION_ABBREVIATIONS[lower]) {
      return DIRECTION_ABBREVIATIONS[lower];
    }
    return word;
  });

  return normalized.join(" ").trim();
}

// Unit number patterns
const UNIT_PATTERNS = [
  /\s+(unit|apt|apartment|#|suite|ste|bldg|building|ph|penthouse)\s*[\w-]+$/i,
  /\s+\d+[a-z]$/i,       // "1278 Main St 4B"
  /,\s*\w+\s*\d+.*$/i,   // "1278 Main St, Unit 4"
];

export function detectUnitAddress(address: string): {
  isUnit: boolean;
  baseAddress: string;
} {
  const upper = address.trim().toUpperCase();

  for (const pattern of UNIT_PATTERNS) {
    if (pattern.test(upper)) {
      const baseAddress = upper.replace(pattern, "").trim();
      return { isUnit: true, baseAddress };
    }
  }

  return { isUnit: false, baseAddress: upper };
}

export function detectPropertyContext(
  address: string,
  yearBuilt?: number | null
): {
  isUnit: boolean;
  isNewConstruction: boolean;
  baseAddress: string;
} {
  const { isUnit, baseAddress } = detectUnitAddress(address);
  const currentYear = new Date().getFullYear();
  const isNewConstruction = yearBuilt
    ? currentYear - yearBuilt <= 5
    : false;

  return { isUnit, isNewConstruction, baseAddress };
}

export function validateAddress(address: string): { valid: boolean; error?: string } {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, error: "Address is required" };
  }

  // Must start with a number (street number)
  if (!/^\d+/.test(trimmed)) {
    return { valid: false, error: "Address must start with a street number" };
  }

  // Must have at least 2 words (number + street name)
  if (trimmed.split(/\s+/).length < 2) {
    return { valid: false, error: "Please enter a complete street address" };
  }

  return { valid: true };
}
