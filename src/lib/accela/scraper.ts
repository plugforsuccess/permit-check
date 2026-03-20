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
}

const PORTAL_URL = "https://aca-prod.accela.com/ATLANTA_GA";
const SEARCH_URL = `${PORTAL_URL}/Cap/CapHome.aspx?module=Building&customglobalsearch=true`;
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
 * Scrape permit records from the Atlanta Accela portal.
 * Returns all pages of results. Never throws — returns [] on failure.
 */
export async function scrapeAccelaPermits(
  streetNumber: string,
  streetName: string
): Promise<PermitRecord[]> {
  let browser: Browser | null = null;

  // Reconstruct a normalized address string to parse into portal fields
  // streetNumber and streetName arrive already split from normalizeAddress()
  const normalizedAddress = `${streetNumber} ${streetName}`;
  const parsed = parseAddressForPortal(normalizedAddress);
  console.log(
    `[accela-scraper] Parsed address: number="${parsed.streetNumber}" name="${parsed.streetName}" suffix="${parsed.streetSuffix}" quadrant="${parsed.quadrant}"`
  );

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(BROWSER_TIMEOUT);

    // Step 1: Navigate to the custom global search page
    console.log("[accela-scraper] Navigating to portal...");
    await page.goto(SEARCH_URL, {
      waitUntil: "networkidle",
      timeout: BROWSER_TIMEOUT,
    });

    // Wait for the search form to be fully interactive
    await page.waitForSelector(SELECTORS.streetNumberFrom, { timeout: SELECTOR_TIMEOUT });
    await page.waitForTimeout(1000);

    // Step 2: Click then fill street number — ASP.NET watermark fields need
    // a click to clear the watermark before fill() will work correctly
    console.log("[accela-scraper] Filling search form...");
    await page.click(SELECTORS.streetNumberFrom);
    await page.fill(SELECTORS.streetNumberFrom, parsed.streetNumber);

    // Step 3: Click then fill street name
    await page.click(SELECTORS.streetName);
    await page.fill(SELECTORS.streetName, parsed.streetName);

    // Step 4: Select street suffix from dropdown if we have one
    if (parsed.streetSuffix) {
      await page.selectOption(SELECTORS.streetSuffix, parsed.streetSuffix);
    }

    // Step 5: Select quadrant from dropdown if we have one
    if (parsed.quadrant) {
      await page.selectOption(SELECTORS.quadrant, parsed.quadrant);
    }

    // Step 6: Widen date range to capture full history
    // Default is last 5 years — click to clear watermark before filling
    await page.click(SELECTORS.startDate);
    await page.fill(SELECTORS.startDate, "01/01/2000");
    await page.click(SELECTORS.endDate);
    await page.fill(SELECTORS.endDate, new Date().toLocaleDateString("en-US", {
      month: "2-digit", day: "2-digit", year: "numeric"
    }));

    // Brief pause to let any ASP.NET postback JS settle before submitting
    await page.waitForTimeout(500);

    // Step 7: Submit
    console.log("[accela-scraper] Submitting search...");
    await page.click(SELECTORS.searchButton);

    // Step 8: Wait for results table or no-results state
    try {
      await page.waitForSelector(SELECTORS.resultsTable, {
        timeout: SELECTOR_TIMEOUT,
      });
    } catch {
      // Log the page title and URL to help diagnose what happened
      const title = await page.title();
      const url = page.url();
      console.log(`[accela-scraper] No results table found. Page: "${title}" URL: ${url}`);
      return [];
    }

    // Step 9: Collect all pages
    const allPermits: PermitRecord[] = [];
    let pageNum = 1;

    while (true) {
      console.log(`[accela-scraper] Parsing results page ${pageNum}...`);
      const pagePermits = await parseResultsTable(page, normalizedAddress);
      allPermits.push(...pagePermits);

      // Try to go to next page
      const nextLink = await page.$(SELECTORS.nextPage);
      if (!nextLink) break;

      await nextLink.click();
      try {
        await page.waitForSelector(SELECTORS.resultsTable, {
          timeout: SELECTOR_TIMEOUT,
        });
        await page.waitForLoadState("networkidle", { timeout: SELECTOR_TIMEOUT });
      } catch {
        break;
      }
      pageNum++;
    }

    console.log(`[accela-scraper] Found ${allPermits.length} total permit records`);
    return allPermits;
  } catch (error) {
    console.error("[accela-scraper] Scraping failed:", error);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Parse the confirmed results table.
 *
 * Column order (verified via DevTools 2026-03-20):
 *   0: Date (filed date)
 *   1: (empty / sort control)
 *   2: Record Number
 *   3: (empty)
 *   4: Record Type
 *   5: (empty)
 *   6: Address
 *   7: (empty)
 *   8: Description
 *   9: (empty)
 *   10: Permit Name
 *   11: (empty)
 *   12: Status
 *   13: (empty)
 *   14: Action
 *   15: (empty)
 *   16: Short Notes
 *
 * The table uses alternating empty spacer columns — we read every other col
 * starting at 0.
 */
async function parseResultsTable(
  page: Page,
  address: string
): Promise<PermitRecord[]> {
  return page.evaluate(
    ({ tableSelector, addr }) => {
      const table = document.querySelector(tableSelector) as HTMLTableElement | null;
      if (!table) return [];

      const permits: PermitRecord[] = [];
      const rows = table.querySelectorAll("tr");

      // Skip row 0 (pagination/count header) and row 1 (column headers)
      // Data rows start at index 2
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td");
        if (cells.length < 7) continue;

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
        ): "Issued" | "Finaled" | "Expired" | "Void" | "In Review" | "Unknown" => {
          const s = raw.toUpperCase().trim();
          if (s.includes("ISSUED") || s.includes("APPROVED")) return "Issued";
          if (s.includes("FINAL") || s.includes("CLOSED") || s.includes("COMPLETE")) return "Finaled";
          if (s.includes("EXPIRED")) return "Expired";
          if (s.includes("VOID") || s.includes("CANCEL")) return "Void";
          if (s.includes("REVIEW") || s.includes("PENDING") || s.includes("SUBMITTED")) return "In Review";
          return "Unknown";
        };

        // Extract data columns (skipping spacer columns)
        const filedDateRaw = getText(cells[0]);
        const recordNumber  = getText(cells[2]);
        const recordType    = getText(cells[4]);
        const description   = getText(cells[8]);
        const statusRaw     = getText(cells[12]);

        if (!recordNumber) continue;

        permits.push({
          recordNumber,
          type: recordType || "Unknown",
          status: mapStatus(statusRaw),
          filedDate: parseDate(filedDateRaw),
          issuedDate: null, // not exposed in list view — available on detail page
          description,
          address: addr,
        });
      }

      return permits;
    },
    { tableSelector: SELECTORS.resultsTable, addr: address }
  );
}
