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
 * Scrape permit records from an Accela portal.
 * Returns all pages of results. Never throws — returns [] on failure.
 */
export async function scrapeAccelaPermits(
  streetNumber: string,
  streetName: string,
  jurisdictionId: string = "ATLANTA_GA"
): Promise<PermitRecord[]> {
  let browser: Browser | null = null;
  const jurisdiction = getJurisdiction(jurisdictionId);

  const normalizedAddress = `${streetNumber} ${streetName}`;
  const parsed = parseAddressForPortal(normalizedAddress);

  console.log(
    `[accela-scraper] Jurisdiction: ${jurisdiction.name} | address: number="${parsed.streetNumber}" name="${parsed.streetName}" suffix="${parsed.streetSuffix}" quadrant="${parsed.quadrant}"`
  );

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(BROWSER_TIMEOUT);

    console.log("[accela-scraper] Navigating to portal...");
    await page.goto(jurisdiction.searchUrl, {
      waitUntil: "networkidle",
      timeout: BROWSER_TIMEOUT,
    });

    await page.waitForSelector(SELECTORS.streetNumberFrom, {
      timeout: SELECTOR_TIMEOUT,
    });
    await page.waitForTimeout(1000);

    console.log("[accela-scraper] Filling search form...");
    await page.click(SELECTORS.streetNumberFrom);
    await page.fill(SELECTORS.streetNumberFrom, parsed.streetNumber);

    await page.click(SELECTORS.streetName);
    await page.fill(SELECTORS.streetName, parsed.streetName);

    if (parsed.streetSuffix) {
      await page.selectOption(SELECTORS.streetSuffix, parsed.streetSuffix);
    }

    // Only Atlanta has the quadrant dropdown
    if (jurisdiction.hasQuadrant && parsed.quadrant) {
      await page.selectOption(SELECTORS.quadrant, parsed.quadrant);
    }

    // Only Atlanta has date range fields
    if (jurisdiction.hasDateRange) {
      await page.click(SELECTORS.startDate);
      await page.fill(SELECTORS.startDate, "01/01/2000");
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

    console.log("[accela-scraper] Submitting search...");
    await page.click(SELECTORS.searchButton);

    try {
      await page.waitForSelector(SELECTORS.resultsTable, {
        timeout: SELECTOR_TIMEOUT,
      });
    } catch {
      const title = await page.title();
      const url = page.url();
      console.log(
        `[accela-scraper] No results table found. Page: "${title}" URL: ${url}`
      );
      return [];
    }

    const allPermits: PermitRecord[] = [];
    let pageNum = 1;

    while (true) {
      console.log(`[accela-scraper] Parsing results page ${pageNum}...`);
      const pagePermits = await parseResultsTable(
        page,
        normalizedAddress,
        jurisdiction.columnMap
      );
      allPermits.push(...pagePermits);

      // Find Next link by text content — works for both standard and postback pagination
      const nextLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        const next = links.find(
          (a) =>
            a.innerText.trim() === "Next >" ||
            a.innerText.trim() === "Next" ||
            a.className.includes("PagerNextStyle")
        );
        return next ? true : false;
      });

      if (!nextLink) break;

      // Click by text — Playwright handles the postback correctly
      await page.getByText("Next >", { exact: true }).first().click();

      try {
        // Wait for the results table to reload after postback
        await page.waitForLoadState("networkidle", { timeout: SELECTOR_TIMEOUT });
        await page.waitForSelector(SELECTORS.resultsTable, { timeout: SELECTOR_TIMEOUT });
        await page.waitForTimeout(500); // extra buffer for postback DOM update
      } catch {
        break;
      }
      pageNum++;
    }

    console.log(
      `[accela-scraper] Found ${allPermits.length} total permit records`
    );
    return allPermits;
  } catch (error) {
    console.error("[accela-scraper] Scraping failed:", error);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function parseResultsTable(
  page: Page,
  address: string,
  columnMap: JurisdictionConfig["columnMap"]
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
        if (!recordNumber || recordNumber.includes(" ")) continue;

        const resolvedAddress =
          cols.address >= 0
            ? getText(cells[cols.address]) || addr
            : addr;

        permits.push({
          recordNumber,
          type: getText(cells[cols.recordType]) || "Unknown",
          status: mapStatus(getText(cells[cols.status])),
          filedDate: parseDate(getText(cells[cols.filedDate])),
          issuedDate: null,
          description:
            getText(cells[cols.description]) ||
            getText(cells[cols.permitName]) ||
            "",
          address: resolvedAddress,
        });
      }

      return permits;
    },
    { tableSelector: SELECTORS.resultsTable, addr: address, cols: columnMap }
  );
}
