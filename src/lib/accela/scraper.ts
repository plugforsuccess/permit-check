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
import type { Browser, BrowserContext, Page } from "playwright-core";
import { getJurisdiction, type AccelaModule, type JurisdictionConfig } from "./jurisdictions";

export interface InspectionRecord {
  inspectionType: string;
  scheduledDate: string | null;
  inspectedDate: string | null;
  result: "Passed" | "Failed" | "Pending" | "Canceled" | "Unknown";
  inspector: string | null;
  comments: string | null;
}

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
  inspections?: InspectionRecord[]; // populated only for high-signal permits
}

export interface ScrapeResult {
  permits: PermitRecord[];
  truncated: boolean;
  usedFuzzyMatch: boolean;
}

const BROWSER_TIMEOUT = 20_000;
const SELECTOR_TIMEOUT = 25_000;

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

  await page.waitForTimeout(2000);

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
 * Check if a permit address matches the expected street number using a
 * word-boundary check to avoid substring false positives
 * (e.g. "12" matching "123 GREENWICH").
 */
function addressMatchesStreetNumber(
  permitAddress: string,
  streetNumber: string
): boolean {
  // Escape any non-digit chars (defensive — streetNumber should be numeric)
  const escaped = streetNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match street number at word boundary — start of string or after whitespace
  const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
  return re.test(permitAddress);
}

const FALLBACK_PAUSE_MS = 1000;

/**
 * Fallback wrapper around scrapeModule. If the primary exact search returns zero
 * results, tries progressively looser searches:
 * 1. Street name only (drop suffix + quadrant)
 * 2. Adjacent street numbers (±1)
 */
async function scrapeModuleWithFallback(
  page: Page,
  searchUrl: string,
  parsed: ReturnType<typeof parseAddressForPortal>,
  normalizedAddress: string,
  jurisdiction: JurisdictionConfig
): Promise<{ permits: PermitRecord[]; usedFallback: boolean; rawCountBeforeFilter?: number }> {
  // Primary search — exact match
  const primaryPermits = await scrapeModule(
    page, searchUrl, parsed, normalizedAddress, jurisdiction
  );

  if (primaryPermits.length > 0) {
    return { permits: primaryPermits, usedFallback: false };
  }

  // Fallback 1 — street name only (no suffix, no quadrant)
  // e.g. "1278 GREENWICH ST SW" → search "1278 GREENWICH"
  if (parsed.streetName) {
    console.log(
      `[accela-scraper] Zero results — trying street name only: "${parsed.streetNumber} ${parsed.streetName}"`
    );

    const looseParsed = {
      ...parsed,
      streetSuffix: "",
      quadrant: "",
    };

    await new Promise((r) => setTimeout(r, FALLBACK_PAUSE_MS));

    try {
      const loosePermits = await scrapeModule(
        page, searchUrl, looseParsed, normalizedAddress, jurisdiction
      );

      if (loosePermits.length > 0) {
        // Filter to results whose address matches both street number (word boundary)
        // and street name — prevents cross-street false positives
        const upperStreetName = parsed.streetName.toUpperCase();
        const filtered = loosePermits.filter((p) => {
          if (!p.address) return false;
          return (
            addressMatchesStreetNumber(p.address, parsed.streetNumber) &&
            p.address.toUpperCase().includes(upperStreetName)
          );
        });

        if (filtered.length > 0) {
          console.log(
            `[accela-scraper] Street name fallback found ${filtered.length} permits (${loosePermits.length} before filter)`
          );
          return {
            permits: filtered,
            usedFallback: true,
            rawCountBeforeFilter: loosePermits.length,
          };
        }
      }
    } catch (err) {
      console.warn("[accela-scraper] Street name fallback failed:", err);
    }
  }

  // Fallback 2 — adjacent street numbers (±1)
  // Handles off-by-one addressing errors
  const streetNum = parseInt(parsed.streetNumber, 10);
  if (!isNaN(streetNum) && streetNum > 1 && parsed.streetName) {
    for (const offset of [-1, 1]) {
      const adjacentNum = streetNum + offset;
      if (adjacentNum <= 0) continue; // skip non-positive street numbers

      const adjacentStr = String(adjacentNum);
      console.log(
        `[accela-scraper] Zero results — trying adjacent number: "${adjacentStr} ${parsed.streetName}"`
      );

      const adjacentParsed = { ...parsed, streetNumber: adjacentStr };

      await new Promise((r) => setTimeout(r, FALLBACK_PAUSE_MS));

      try {
        const adjacentPermits = await scrapeModule(
          page, searchUrl, adjacentParsed, normalizedAddress, jurisdiction
        );

        if (adjacentPermits.length > 0) {
          // Verify results actually match the adjacent address street name
          const verified = adjacentPermits.filter((p) => {
            if (!p.address) return false;
            return (
              addressMatchesStreetNumber(p.address, adjacentStr) &&
              p.address.toUpperCase().includes(parsed.streetName.toUpperCase())
            );
          });

          if (verified.length > 0) {
            console.log(
              `[accela-scraper] Adjacent number fallback found ${verified.length} permits at ${adjacentStr}`
            );
            return {
              permits: verified,
              usedFallback: true,
              rawCountBeforeFilter: adjacentPermits.length,
            };
          }
        }
      } catch (err) {
        console.warn(
          `[accela-scraper] Adjacent number fallback (${adjacentStr}) failed:`,
          err
        );
      }
    }
  }

  return { permits: [], usedFallback: false };
}

const RETRY_DELAY_MS = 8000;
const MAX_ATTEMPTS = 2;

/**
 * Retry wrapper around scrapeModuleWithFallback. If the module times out,
 * wait 8 seconds and try once more before giving up — handles transient
 * portal rate-limiting without skipping the module entirely.
 */
async function scrapeModuleWithRetry(
  context: BrowserContext,
  mod: AccelaModule,
  parsed: ReturnType<typeof parseAddressForPortal>,
  normalizedAddress: string,
  jurisdiction: JurisdictionConfig
): Promise<{ permits: PermitRecord[]; usedFallback: boolean; rawCountBeforeFilter?: number }> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const page = await context.newPage();
    page.setDefaultTimeout(BROWSER_TIMEOUT);

    try {
      const result = await scrapeModuleWithFallback(
        page,
        mod.searchUrl,
        parsed,
        normalizedAddress,
        jurisdiction
      );
      return result;
    } catch (err) {
      console.error(
        `[accela-scraper] Module ${mod.name} attempt ${attempt} failed:`,
        err
      );
      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `[accela-scraper] Retrying ${mod.name} in ${RETRY_DELAY_MS / 1000} seconds...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    } finally {
      await page.close();
    }
  }

  return { permits: [], usedFallback: false };
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
    let usedFuzzyMatch = false;

    // Scrape each module sequentially with retry on failure
    for (const mod of jurisdiction.modules) {
      console.log(`[accela-scraper] Scraping module: ${mod.name}`);

      const { permits: modulePermits, usedFallback, rawCountBeforeFilter } =
        await scrapeModuleWithRetry(
          context,
          mod,
          parsed,
          normalizedAddress,
          jurisdiction
        );

      if (usedFallback) {
        usedFuzzyMatch = true;
        console.log(
          `[accela-scraper] Module ${mod.name}: used fuzzy fallback`
        );
      }

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

      // Use raw count before filtering for truncation check — fallback
      // filtering can reduce 150→3 results, masking truncation
      const countForTruncation = rawCountBeforeFilter ?? modulePermits.length;
      if (countForTruncation >= 100) anyTruncated = true;

      console.log(
        `[accela-scraper] Module ${mod.name}: ${modulePermits.length} records, ${newCount} new`
      );

      // Pause between modules to avoid rate limiting
      if (jurisdiction.modules.indexOf(mod) < jurisdiction.modules.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    console.log(
      `[accela-scraper] Total: ${allPermits.length} unique permit records across all modules`
    );

    // Selectively fetch inspection history for high-signal permits
    const HIGH_SIGNAL_STATUSES = new Set(["Expired", "In Review"]);
    const COMPLAINT_TYPES = /complaint|violation|code/i;

    // Sort by filed date descending to identify most recent
    const sortedForRecency = [...allPermits].sort((a, b) => {
      if (!a.filedDate && !b.filedDate) return 0;
      if (!a.filedDate) return 1;
      if (!b.filedDate) return -1;
      return b.filedDate > a.filedDate ? 1 : -1;
    });

    const mostRecentRecord = sortedForRecency[0]?.recordNumber;

    const permitsNeedingDetail = allPermits.filter((p) => {
      if (HIGH_SIGNAL_STATUSES.has(p.status)) return true;
      if (COMPLAINT_TYPES.test(p.type)) return true;
      if (p.recordNumber === mostRecentRecord) return true;
      return false;
    });

    // Cap at 5 detail page fetches to limit runtime
    const detailFetchTargets = permitsNeedingDetail.slice(0, 5);

    if (detailFetchTargets.length > 0) {
      console.log(
        `[accela-scraper] Fetching inspection history for ${detailFetchTargets.length} permits`
      );

      const detailPage = await context.newPage();
      detailPage.setDefaultTimeout(15000);

      for (const permit of detailFetchTargets) {
        const inspections = await fetchInspectionHistory(
          detailPage,
          permit.recordNumber,
          jurisdictionId,
          permit.module ?? "Building"
        );

        permit.inspections = inspections;

        if (inspections.length > 0) {
          console.log(
            `[accela-scraper] ${permit.recordNumber}: ${inspections.length} inspection records`
          );
        }

        // Brief pause between detail page fetches
        await detailPage.waitForTimeout(500);
      }

      await detailPage.close();
    }

    return { permits: allPermits, truncated: anyTruncated, usedFuzzyMatch };
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

/**
 * Fetch inspection history from an Accela permit detail page.
 * Only called for high-signal permits (expired, in-review, complaints, most recent).
 * Returns empty array on failure — never throws.
 */
async function fetchInspectionHistory(
  page: Page,
  recordNumber: string,
  jurisdictionId: string,
  module: string = "Building"
): Promise<InspectionRecord[]> {
  const jurisdiction = getJurisdiction(jurisdictionId);
  const detailUrl = `${jurisdiction.portalUrl}/Cap/CapDetail.aspx?altId=${encodeURIComponent(recordNumber)}&module=${module}`;

  try {
    await page.goto(detailUrl, {
      waitUntil: "networkidle",
      timeout: 15000,
    });

    // Wait for the page to load
    await page.waitForTimeout(1000);

    // Extract inspection records from the inspection history table
    const inspections = await page.evaluate(() => {
      // Accela inspection table selector — try common patterns
      const table = document.querySelector(
        "table[id*='Inspection'], table[id*='inspection'], #tblInspectionResult"
      ) as HTMLTableElement | null;

      if (!table) return [];

      const records: Array<{
        inspectionType: string;
        scheduledDate: string | null;
        inspectedDate: string | null;
        result: string;
        inspector: string | null;
        comments: string | null;
      }> = [];

      const rows = table.querySelectorAll("tr");

      // Skip header rows (first 1-2 rows)
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td");
        if (cells.length < 3) continue;

        const getText = (cell: Element | undefined) =>
          (cell?.textContent || "").trim();

        // Column order varies by portal — try common patterns
        // Most Accela portals: [type, scheduled, inspected, result, inspector]
        const inspectionType = getText(cells[0]);
        if (!inspectionType) continue;

        const result = getText(cells[3] ?? cells[2]);
        const normalizedResult = (() => {
          const r = result.toUpperCase();
          if (r.includes("PASS")) return "Passed" as const;
          if (r.includes("FAIL")) return "Failed" as const;
          if (r.includes("CANCEL")) return "Canceled" as const;
          if (r.includes("PEND") || r.includes("SCHEDUL")) return "Pending" as const;
          return "Unknown" as const;
        })();

        records.push({
          inspectionType,
          scheduledDate: getText(cells[1]) || null,
          inspectedDate: getText(cells[2]) || null,
          result: normalizedResult,
          inspector: cells[4] ? getText(cells[4]) : null,
          comments: cells[5] ? getText(cells[5]) : null,
        });
      }

      return records;
    }) as InspectionRecord[];

    return inspections;
  } catch (err) {
    // Never fail the main scrape due to detail page errors
    console.warn(
      `[accela-scraper] Failed to fetch inspection history for ${recordNumber}:`,
      err
    );
    return [];
  }
}
