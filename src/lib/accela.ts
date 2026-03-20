/**
 * Accela integration for Atlanta permit data.
 *
 * Strategy:
 * 1. Try Accela Developer API first (preferred, requires agency approval)
 * 2. Fall back to public portal scraping via fetch + cheerio
 * 3. Check cache before either approach
 *
 * The public Accela portal for Atlanta is at:
 * https://aca-prod.accela.com/ATLANTA_GA
 */

import { config } from "./config";
import { normalizeAddress } from "./address";
import type { Permit, PermitStatus, PermitSearchResult } from "@/types";
import * as cheerio from "cheerio";
import { LRUCache } from "lru-cache";

// LRU cache with 24-hour TTL and max 1000 entries
const permitCache = new LRUCache<string, PermitSearchResult>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

export interface PermitFetchResult extends PermitSearchResult {
  warning?: string;
}

/**
 * Main entry point: fetch permits for an address.
 * Tries cache → Accela API → scraper fallback.
 * Never throws — returns empty results with a warning on failure.
 */
export async function fetchPermits(
  addressRaw: string
): Promise<PermitFetchResult> {
  const normalized = normalizeAddress(addressRaw);

  // Check cache first
  const cached = permitCache.get(normalized);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  // Try Accela API first
  if (config.accela.appId && config.accela.appSecret) {
    try {
      const result = await fetchFromAccelaApi(normalized);
      permitCache.set(normalized, result);
      return result;
    } catch (error) {
      console.warn("Accela API failed, falling back to scraper:", error);
    }
  }

  // Fall back to public portal scraping
  try {
    const result = await fetchFromAccelaPortal(normalized);
    permitCache.set(normalized, result);
    return result;
  } catch (error) {
    console.error("All Accela data sources failed:", error);
    return {
      permits: [],
      total_count: 0,
      source: "accela_scraper",
      warning:
        "Permit data temporarily unavailable. Please try again shortly.",
    };
  }
}

/**
 * Option A: Accela Developer API
 * Requires registration at developer.accela.com and ATLANTA_GA agency approval.
 */
async function fetchFromAccelaApi(
  normalizedAddress: string
): Promise<PermitSearchResult> {
  // Get access token
  const tokenResponse = await fetch(
    `${config.accela.apiBaseUrl}/oauth2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.accela.appId,
        client_secret: config.accela.appSecret,
        agency_name: config.accela.agency,
        environment: config.accela.environment,
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Accela auth failed: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  // Parse street number and name from normalized address
  const parts = normalizedAddress.split(/\s+/);
  const streetNumber = parts[0];
  const streetName = parts.slice(1).join(" ");

  // Search records by address
  const searchParams = new URLSearchParams({
    streetStart: streetNumber,
    streetName: streetName,
    limit: "100",
    offset: "0",
  });

  const recordsResponse = await fetch(
    `${config.accela.apiBaseUrl}/records?${searchParams}`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "x-accela-appid": config.accela.appId,
      },
    }
  );

  if (!recordsResponse.ok) {
    throw new Error(`Accela records search failed: ${recordsResponse.status}`);
  }

  const data = await recordsResponse.json();
  const records = data.result || [];

  const permits: Permit[] = records.map(
    (record: {
      id: string;
      type?: { text?: string };
      status?: { text?: string };
      openedDate?: string;
      statusDate?: string;
      description?: string;
      contacts?: Array<{ businessName?: string; fullName?: string }>;
    }) => ({
      lookup_id: "",
      record_number: record.id || "N/A",
      type: record.type?.text || "Unknown",
      status: mapAccelaStatus(record.status?.text || ""),
      filed_date: record.openedDate || null,
      issued_date: record.statusDate || null,
      description: record.description || "",
      contractor: record.contacts?.[0]?.businessName ||
        record.contacts?.[0]?.fullName ||
        null,
    })
  );

  return {
    permits,
    total_count: permits.length,
    source: "accela_api",
  };
}

/**
 * Option B: Public Portal Scraping (interim fallback)
 * Scrapes the Accela Citizen Access portal for Atlanta.
 */
async function fetchFromAccelaPortal(
  normalizedAddress: string
): Promise<PermitSearchResult> {
  const parts = normalizedAddress.split(/\s+/);
  const streetNumber = parts[0];
  const streetName = parts.slice(1).join(" ");

  try {
    // Step 1: Make the search request to the public portal
    const searchUrl = `${config.accela.portalBaseUrl}/Cap/CapHome.aspx`;

    // The Accela portal uses ASP.NET postbacks. We'll attempt a direct search.
    const searchParams = new URLSearchParams({
      module: "Building",
      TabName: "Building",
      SearchType: "ByAddress",
      HouseNumberFrom: streetNumber,
      StreetName: streetName,
    });

    const response = await fetch(`${searchUrl}?${searchParams}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Portal request failed: ${response.status}`);
    }

    const html = await response.text();
    const permits = parseAccelaPortalResults(html);

    return {
      permits,
      total_count: permits.length,
      source: "accela_scraper",
    };
  } catch (error) {
    console.error("Accela portal scraping failed:", error);
    throw error;
  }
}

/**
 * Parse HTML results from Accela Citizen Access portal.
 */
function parseAccelaPortalResults(html: string): Permit[] {
  const $ = cheerio.load(html);
  const permits: Permit[] = [];

  // Accela portal uses a GridView table for results
  // The exact selectors depend on Atlanta's configuration
  const resultRows = $(
    'table[id*="GridView"] tr, table.ACA_Grid_Caption tr'
  ).not(":first-child"); // Skip header row

  resultRows.each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 4) {
      const permit: Permit = {
        lookup_id: "",
        record_number: $(cells[0]).text().trim() || "N/A",
        type: $(cells[1]).text().trim() || "Unknown",
        status: mapAccelaStatus($(cells[2]).text().trim()),
        filed_date: parseDate($(cells[3]).text().trim()),
        issued_date: cells.length > 4 ? parseDate($(cells[4]).text().trim()) : null,
        description: cells.length > 5 ? $(cells[5]).text().trim() : "",
        contractor: cells.length > 6 ? $(cells[6]).text().trim() || null : null,
      };
      permits.push(permit);
    }
  });

  return permits;
}

/**
 * Map Accela status strings to our PermitStatus type.
 */
function mapAccelaStatus(rawStatus: string): PermitStatus {
  const status = rawStatus.toUpperCase().trim();

  if (status.includes("ISSUED") || status.includes("APPROVED")) return "Issued";
  if (status.includes("EXPIRED")) return "Expired";
  if (status.includes("REVIEW") || status.includes("PENDING REVIEW"))
    return "In Review";
  if (status.includes("FINAL") || status.includes("CLOSED") || status.includes("COMPLETE"))
    return "Finaled";
  if (status.includes("VOID") || status.includes("CANCEL")) return "Void";
  if (status.includes("PENDING") || status.includes("SUBMITTED")) return "Pending";

  return "Unknown";
}

/**
 * Parse various date formats from Accela.
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr === "N/A" || dateStr === "") return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
}
