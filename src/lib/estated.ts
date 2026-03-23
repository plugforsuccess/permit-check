/**
 * Estated API — property characteristics lookup.
 * Returns beds, baths, sq ft, year built, last sale price/date.
 * Cost: ~$0.10 per lookup. Only called after payment to keep costs down.
 */

export interface EstatedProperty {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  assessedValue: number | null;
  ownerOccupied: boolean | null;
}

const ESTATED_BASE = "https://sandbox.estated.com/v4/property";

export async function fetchPropertyData(
  address: string
): Promise<EstatedProperty | null> {
  const apiKey = process.env.ESTATED_API_KEY;
  if (!apiKey) {
    console.warn("[estated] ESTATED_API_KEY not set");
    return null;
  }

  try {
    const url = new URL(ESTATED_BASE);
    url.searchParams.set("token", apiKey);
    url.searchParams.set("combined_address", address);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      console.warn(`[estated] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const p = data?.data;
    if (!p) return null;

    return {
      beds: p.structure?.beds_count ?? null,
      baths: p.structure?.baths ?? null,
      sqft: p.structure?.area_sq_ft ?? null,
      yearBuilt: p.structure?.year_built ?? null,
      propertyType: p.parcel?.location_descriptions?.[0] ?? null,
      lastSalePrice: p.deeds?.[0]?.sale_price ?? null,
      lastSaleDate: p.deeds?.[0]?.document_date ?? null,
      assessedValue: p.assessments?.[0]?.total_value ?? null,
      ownerOccupied: p.owner?.owner_occupied ?? null,
    };
  } catch (err) {
    console.warn("[estated] Lookup failed:", err);
    return null; // Never block report generation on Estated failure
  }
}

export function formatPropertyContext(p: EstatedProperty): string {
  const parts: string[] = [];
  if (p.propertyType) parts.push(`Property type: ${p.propertyType}`);
  if (p.yearBuilt) parts.push(`Year built: ${p.yearBuilt}`);
  if (p.beds && p.baths) parts.push(`${p.beds} bed / ${p.baths} bath`);
  if (p.sqft) parts.push(`${p.sqft.toLocaleString()} sq ft`);
  if (p.lastSalePrice && p.lastSaleDate) {
    const year = new Date(p.lastSaleDate).getFullYear();
    parts.push(`Last sold: ${year} for $${p.lastSalePrice.toLocaleString()}`);
  }
  if (p.assessedValue) {
    parts.push(`Assessed value: $${p.assessedValue.toLocaleString()}`);
  }
  if (p.ownerOccupied === false) {
    parts.push("Owner-occupied: No (investor/rental property)");
  }
  return parts.length > 0 ? parts.join(" · ") : "Property data unavailable";
}
