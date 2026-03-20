/**
 * Address normalization for Accela portal queries.
 * The Accela portal is picky about address format — this module
 * splits raw addresses into street number + street name and normalizes
 * directionals, abbreviations, and punctuation.
 */

const DIRECTION_MAP: Record<string, string> = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
  ne: "Northeast",
  nw: "Northwest",
  se: "Southeast",
  sw: "Southwest",
};

const STREET_TYPE_MAP: Record<string, string> = {
  st: "St",
  ave: "Ave",
  blvd: "Blvd",
  dr: "Dr",
  rd: "Rd",
  ln: "Ln",
  ct: "Ct",
  cir: "Cir",
  pl: "Pl",
  way: "Way",
  ter: "Ter",
  trl: "Trl",
  pkwy: "Pkwy",
  hwy: "Hwy",
  street: "St",
  avenue: "Ave",
  boulevard: "Blvd",
  drive: "Dr",
  road: "Rd",
  lane: "Ln",
  court: "Ct",
  circle: "Cir",
  place: "Pl",
  terrace: "Ter",
  trail: "Trl",
  parkway: "Pkwy",
  highway: "Hwy",
};

export function normalizeAddress(raw: string): {
  streetNumber: string;
  streetName: string;
} {
  let address = raw.trim();

  // Remove city, state, zip if present
  address = address.replace(
    /,?\s*atlanta\s*,?\s*(ga|georgia)?\s*\d{0,5}\s*$/i,
    ""
  );

  // Remove apartment/unit/suite info
  address = address.replace(
    /\s*(apt|unit|ste|suite|#)\s*\.?\s*\w+\s*$/i,
    ""
  );

  // Remove trailing punctuation
  address = address.replace(/[.,]+$/, "").trim();

  const words = address.split(/\s+/);
  if (words.length < 2) {
    return { streetNumber: words[0] || "", streetName: "" };
  }

  const streetNumber = words[0];
  const rest = words.slice(1);

  // Normalize each word in the street name
  const normalizedParts = rest.map((word) => {
    const clean = word.replace(/\.$/, "").toLowerCase();

    // Check directionals
    if (DIRECTION_MAP[clean]) {
      return DIRECTION_MAP[clean];
    }

    // Check street types
    if (STREET_TYPE_MAP[clean]) {
      return STREET_TYPE_MAP[clean];
    }

    // Title-case other words
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return {
    streetNumber,
    streetName: normalizedParts.join(" "),
  };
}
