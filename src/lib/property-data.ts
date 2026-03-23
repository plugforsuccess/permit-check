/**
 * Property data enrichment via RealEstateAPI.com (REAPI).
 * Returns property characteristics for AI summary context.
 * Called once after payment — cost ~$0.10-0.50 per lookup.
 *
 * Docs: https://developer.realestateapi.com/reference/property-detail-api-1
 */

export interface PropertyData {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  assessedValue: number | null;
  ownerOccupied: boolean | null;
  ownerName: string | null;
  isInvestorOwned: boolean | null;
}

const REAPI_BASE = "https://api.realestateapi.com/v2/PropertyDetail";

export async function fetchPropertyData(
  address: string
): Promise<PropertyData | null> {
  const apiKey = process.env.REAPI_API_KEY;
  if (!apiKey) {
    console.warn("[property-data] REAPI_API_KEY not set — skipping enrichment");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(REAPI_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          address,
          // Request only the fields we need to minimize credit usage
          include: [
            "propertyInfo",
            "saleHistory",
            "ownerInfo",
            "taxInfo",
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      console.warn(`[property-data] REAPI error: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // REAPI wraps response in data.data
    const p = data?.data;
    if (!p) {
      console.warn("[property-data] No data returned for address:", address);
      return null;
    }

    // Extract from REAPI response structure
    const propertyInfo = p.propertyInfo ?? {};
    const saleHistory = p.saleHistory ?? [];
    const ownerInfo = p.ownerInfo ?? {};
    const taxInfo = p.taxInfo ?? {};

    // Most recent sale
    const lastSale = saleHistory[0] ?? null;

    // Detect investor ownership — non-owner-occupied or LLC/Corp owner name
    const ownerName = ownerInfo.owner1FullName ?? ownerInfo.companyName ?? null;
    const isInvestorOwned =
      ownerInfo.ownerOccupied === false ||
      /\b(llc|corp|inc|ltd|trust|group|properties|holdings|investments)\b/i.test(
        ownerName ?? ""
      );

    return {
      beds: propertyInfo.bedrooms ?? null,
      baths: propertyInfo.bathrooms ?? null,
      sqft: propertyInfo.livingSquareFeet ?? propertyInfo.squareFeet ?? null,
      yearBuilt: propertyInfo.yearBuilt ?? null,
      propertyType:
        propertyInfo.propertyUseCode ??
        propertyInfo.propertyType ??
        null,
      lastSalePrice: lastSale?.saleAmount ?? null,
      lastSaleDate: lastSale?.recordingDate ?? lastSale?.saleDate ?? null,
      assessedValue:
        taxInfo.assessedValue ?? taxInfo.totalAssessedValue ?? null,
      ownerOccupied: ownerInfo.ownerOccupied ?? null,
      ownerName,
      isInvestorOwned: isInvestorOwned ?? null,
    };
  } catch (err) {
    // Never block report generation on property data failure
    console.warn("[property-data] Lookup failed:", err);
    return null;
  }
}

export function formatPropertyContext(p: PropertyData): string {
  const parts: string[] = [];

  if (p.propertyType) parts.push(`Type: ${p.propertyType}`);
  if (p.yearBuilt) parts.push(`Built: ${p.yearBuilt}`);
  if (p.beds && p.baths) parts.push(`${p.beds}BR / ${p.baths}BA`);
  if (p.sqft) parts.push(`${p.sqft.toLocaleString()} sq ft`);
  if (p.lastSalePrice && p.lastSaleDate) {
    const year = new Date(p.lastSaleDate).getFullYear();
    parts.push(`Last sold ${year} for $${p.lastSalePrice.toLocaleString()}`);
  }
  if (p.assessedValue) {
    parts.push(`Assessed $${p.assessedValue.toLocaleString()}`);
  }
  if (p.isInvestorOwned) {
    parts.push(`Owner: ${p.ownerName ?? "Investor/LLC"} (non-owner-occupied)`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Property data unavailable";
}

/**
 * Calculate years since last sale — used for flip detection in AI summary.
 */
export function yearsSinceLastSale(p: PropertyData): number | null {
  if (!p.lastSaleDate) return null;
  const saleDate = new Date(p.lastSaleDate);
  if (isNaN(saleDate.getTime())) return null;
  return Math.floor(
    (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
  );
}
