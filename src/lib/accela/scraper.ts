/**
 * Accela Citizen Access scraper using Playwright.
 *
 * Target: https://aca-prod.accela.com/ATLANTA_GA/Cap/CapHome.aspx?module=Building&customglobalsearch=true
 *
 * Selectors verified via DevTools on 2026-03-20.
 * The Atlanta portal uses a custom global search form (not the standard ACA
 * address form), with separate fields for street number, street name,
 * street type (suffix dropdown), and quadrant (NE/NW/SE/SW dropdown).
 */
import chromium from "@sparticuz/chromium-min";
import { chromium as playwrightChromium } from "playwright-core";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.x64.tar";
import type { Browser, Page } from "playwright-core";
import { getJurisdiction, type JurisdictionConfig } from "./jurisdictions";

export interface PermitRecord {
  recordNumber: string;
  type: string;
  status:
    | "Issued"
    | "Finaled"
    | "Expired"
    | "Void"
    | "In Review"
    | "Unknown";
  filedDate: string | null;
  issuedDate: string | null;
  description: string;
  address: string;
  module?: string; // "Building", "Electrical", "Plumbing", etc.
}

export interface ScrapeResult {
  permits: PermitRecord[];
  truncated: boolean;
}

const BROWSER_TIMEOUT = 20_000;
const SELECTOR_TIMEOUT = 15_000;

// Confirmed field IDs (DevTools-verified 2026-03-20)
const SELECTORS = {
  streetNumberFrom: "#ctl00_PlaceHolderMain_generalSearchForm_txtGSNumber_ChildControl0",
  streetName:       "#ctl00_PlaceHolderMain_generalSearchForm_txtGSStreetName",
  streetSuffix:     "#ctl00_PlaceHolderMain_generalSearchForm_ddlGSStreetSuffix",
  quadrant:         "#ctl00_PlaceHolderMain_generalSearchForm_ddlGSStreetSuffixDirection",
  startDate:        "#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate",
  endDate:          "#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate",
  searchButton:     "#ctl00_PlaceHolderMain_btnNewSearch",
  // Results table — confirmed id and class
  resultsTable:     "#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList",
  // Pagination
  nextPage:         "a.aca_pagination_PagerNextStyle",
} as const;

// Street type suffix values accepted by the Atlanta portal dropdown
const SUFFIX_MAP: Record<string, string> = {
  ALY: "ALY", ALLEY: "ALY",
  AVE: "AVE", AVENUE: "AVE",
  BLVD: "BLVD", BOULEVARD: "BLVD",
  CIR: "CIR", CIRCLE: "CIR",
  CT: "CT", COURT: "CT",
  DR: "DR", DRIVE: "DR",
  EXT: "EXT", EXTENSION: "EXT",
  HWY: "HWY", HIGHWAY: "HWY",
  LN: "LN", LANE: "LN",
  PKWY: "PKWY", PARKWAY: "PKWY",
  PL: "PL", PLACE: "PL",
  PLZ: "PLZ", PLAZA: "PLZ",
  RD: "RD", ROAD: "RD",
  ST: "ST", STREET: "ST",
  TER: "TER", TERRACE: "TER",
  TRL: "TRL", TRAIL: "TRL",
  WAY: "WAY",
};

// Quadrant values accepted by the portal dropdown
const QUADRANT_VALUES = new Set(["NE", "NW", "SE", "SW"]);

/**
 * Parse a normalized address string into portal field components.
 *
 * Input examples (from normalizeAddress() in address.ts):
 *   "55 TRINITY AVE SW"       → { number: "55", name: "TRINITY", suffix: "AVE", quadrant: "SW" }
 *   "130 PEACHTREE ST NW"     → { number: "130", name: "PEACHTREE", suffix: "ST", quadrant: "NW" }
 *   "1278 GREENWICH ST SW"    → { number: "1278", name: "GREENWICH", suffix: "ST", quadrant: "SW" }
 *   "100 MAIN ST"             → { number: "100", name: "MAIN", suffix: "ST", quadrant: "" }
 */
function parseAddressForPortal(normalizedAddress: string): {
  streetNumber: string;
  streetName: string;
  streetSuffix: string;  // portal dropdown value e.g. "AVE"
  quadrant: string;      // portal dropdown value e.g. "SW" or ""
} {
  const parts = normalizedAddress.trim().toUpperCase().split(/\s+/);

  // First token is always the street number
  const streetNumber = parts[0] ?? "";
  const rest = parts.slice(1);

  // Check if last token is a quadrant (NE/NW/SE/SW)
  const lastToken = rest[rest.length - 1] ?? "";
  let quadrant = "";
  let suffixAndNameParts = rest;
  if (QUADRANT_VALUES.has(lastToken)) {
    quadrant = lastToken;
    suffixAndNameParts = rest.slice(0, -1);
  }

  // Check if the new last token is a street suffix
  const newLast = suffixAndNameParts[suffixAndNameParts.length - 1] ?? "";
  let streetSuffix = "";
  let nameParts = suffixAndNameParts;
  if (SUFFIX_MAP[newLast]) {
    streetSuffix = SUFFIX_MAP[newLast];
    nameParts = suffixAndNameParts.slice(0, -1);
  }

  // Remaining tokens are the street name
  const streetName = nameParts.join(" ");

  return { streetNumber, streetName, streetSuffix, quadrant };
}

async function launchBrowser(): Promise<Browser> {
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
    headless: true,
  });
}

/**
 * Scrape a single module's permit records from an Accela portal.
 */
async function scrapeModule(
  page: Page,
  searchUrl: string,
  parsed: ReturnType<typeof parseAddressForPortal>,
  normalizedAddress: string,
  jurisdiction: JurisdictionConfig
): Promise<PermitRecord[]> {
  await page.goto(searchUrl, {
    waitUntil: "networkidle",
    timeout: BROWSER_TIMEOUT,
  });

  await page.waitForSelector(SELECTORS.streetNumberFrom, {
    timeout: SELECTOR_TIMEOUT,
  });
  await page.waitForTimeout(1000);

  await page.click(SELECTORS.streetNumberFrom);
  await page.fill(SELECTORS.streetNumberFrom, parsed.streetNumber);
  await page.click(SELECTORS.streetName);
  await page.fill(SELECTORS.streetName, parsed.streetName);

  if (parsed.streetSuffix) {
    await page.selectOption(SELECTORS.streetSuffix, parsed.streetSuffix);
  }

  if (jurisdiction.hasQuadrant && parsed.quadrant) {
    await page.selectOption(SELECTORS.quadrant, parsed.quadrant);
  }

  if (jurisdiction.hasDateRange) {
    await page.click(SELECTORS.startDate);
    await page.fill(SELECTORS.startDate, "01/01/1990");
    await page.click(SELECTORS.endDate);
    await page.fill(
      SELECTORS.endDate,
      new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    );
  }

  await page.waitForTimeout(500);
  await page.click(SELECTORS.searchButton);

  try {
    await page.waitForSelector(SELECTORS.resultsTable, {
      timeout: SELECTOR_TIMEOUT,
    });
  } catch {
    // No results for this module — normal, not an error
    return [];
  }

  const modulePermits: PermitRecord[] = [];
  const MAX_PAGES = 10;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const pagePermits = await parseResultsTable(
      page,
      normalizedAddress,
      jurisdiction.columnMap,
      jurisdiction.resultsTableSelector
    );
    modulePermits.push(...pagePermits);

    // Pagination
    let hasNextPage = false;
    const standardNext = await page.$("a.aca_pagination_PagerNextStyle");
    if (standardNext) {
      await standardNext.click();
      hasNextPage = true;
    } else {
      const textNext = await page
        .getByText("Next >", { exact: true })
        .first();
      const isVisible = await textNext.isVisible().catch(() => false);
      if (isVisible) {
        await textNext.click();
        hasNextPage = true;
      }
    }

    if (!hasNextPage) break;

    try {
      await page.waitForLoadState("networkidle", {
        timeout: SELECTOR_TIMEOUT,
      });
      await page.waitForSelector(SELECTORS.resultsTable, {
        timeout: SELECTOR_TIMEOUT,
      });
      await page.waitForTimeout(500);
    } catch {
      break;
    }
  }

  return modulePermits;
}

/**
 * Scrape permit records from an Accela portal across all configured modules.
 * Deduplicates by record number across modules. Never throws — returns [] on failure.
 */
export async function scrapeAccelaPermits(
  streetNumber: string,
  streetName: string,
  jurisdictionId: string = "ATLANTA_GA"
): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  const jurisdiction = getJurisdiction(jurisdictionId);

  const normalizedAddress = `${streetNumber} ${streetName}`;
  const parsed = parseAddressForPortal(normalizedAddress);

  console.log(
    `[accela-scraper] Jurisdiction: ${jurisdiction.name} | modules: ${jurisdiction.modules.map((m) => m.name).join(", ")}`
  );

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const allPermits: PermitRecord[] = [];
    const seenRecordNumbers = new Set<string>();
    let anyTruncated = false;

    // Scrape each module sequentially
    for (const mod of jurisdiction.modules) {
      console.log(`[accela-scraper] Scraping module: ${mod.name}`);

      const page = await context.newPage();
      page.setDefaultTimeout(BROWSER_TIMEOUT);

      try {
        const modulePermits = await scrapeModule(
          page,
          mod.searchUrl,
          parsed,
          normalizedAddress,
          jurisdiction
        );

        // Tag each permit with its source module
        modulePermits.forEach((p) => (p.module = mod.name));

        // Deduplicate across modules — same record can appear in multiple modules
        let newCount = 0;
        for (const permit of modulePermits) {
          if (!seenRecordNumbers.has(permit.recordNumber)) {
            seenRecordNumbers.add(permit.recordNumber);
            allPermits.push(permit);
            newCount++;
          }
        }

        if (modulePermits.length >= 100) anyTruncated = true;

        console.log(
          `[accela-scraper] Module ${mod.name}: ${modulePermits.length} records, ${newCount} new`
        );
      } catch (err) {
        // Don't fail entire scrape if one module fails — log and continue
        console.error(
          `[accela-scraper] Module ${mod.name} failed:`,
          err
        );
      } finally {
        await page.close();
      }

      // Brief pause between modules to avoid rate limiting
      if (jurisdiction.modules.indexOf(mod) < jurisdiction.modules.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log(
      `[accela-scraper] Total: ${allPermits.length} unique permit records across all modules`
    );
    return { permits: allPermits, truncated: anyTruncated };
  } catch (error) {
    console.error("[accela-scraper] Scraping failed:", error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function parseResultsTable(
  page: Page,
  address: string,
  columnMap: JurisdictionConfig["columnMap"],
  resultsTableSelector: string
): Promise<PermitRecord[]> {
  return page.evaluate(
    ({ tableSelector, addr, cols }: { tableSelector: string; addr: string; cols: Record<string, number> }) => {
      const table = document.querySelector(
        tableSelector
      ) as HTMLTableElement | null;
      if (!table) return [];

      const permits: PermitRecord[] = [];
      const rows = table.querySelectorAll("tr");

      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td");
        if (cells.length < 3) continue;

        const getText = (cell: Element | undefined): string => {
          if (!cell) return "";
          const link = cell.querySelector("a");
          return (link?.textContent || cell.textContent || "").trim();
        };

        const parseDate = (dateStr: string): string | null => {
          if (!dateStr || dateStr === "N/A" || dateStr === "") return null;
          try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split("T")[0];
          } catch {
            return null;
          }
        };

        const mapStatus = (
          raw: string
        ):
          | "Issued"
          | "Finaled"
          | "Expired"
          | "Void"
          | "In Review"
          | "Unknown" => {
          const s = raw.toUpperCase().trim();
          if (s.includes("ISSUED") || s.includes("APPROVED")) return "Issued";
          if (
            s.includes("FINAL") ||
            s.includes("CLOSED") ||
            s.includes("COMPLETE")
          )
            return "Finaled";
          if (s.includes("EXPIRED")) return "Expired";
          if (s.includes("VOID") || s.includes("CANCEL")) return "Void";
          if (
            s.includes("REVIEW") ||
            s.includes("PENDING") ||
            s.includes("SUBMITTED")
          )
            return "In Review";
          return "Unknown";
        };

        const recordNumber = getText(cells[cols.recordNumber]);
        // Valid Accela record numbers contain a hyphen and are not purely numeric
        if (!recordNumber || recordNumber.includes(" ") || !/[A-Z].*-.*\d/.test(recordNumber)) continue;

        const resolvedAddress =
          cols.address >= 0
            ? getText(cells[cols.address]) || addr
            : addr;

        permits.push({
          recordNumber,
          type: getText(cells[cols.recordType]) || "Unknown",
          status: mapStatus(getText(cells[cols.status])),
          filedDate: parseDate(getText(cells[cols.filedDate])),
          issuedDate:
            cols.issuedDate >= 0
              ? parseDate(getText(cells[cols.issuedDate]))
              : null, // Not available in search results — only on detail page
          description:
            getText(cells[cols.description]) ||
            getText(cells[cols.permitName]) ||
            "",
          address: resolvedAddress,
        });
      }

      return permits;
    },
    { tableSelector: resultsTableSelector, addr: address, cols: columnMap }
  );
}
