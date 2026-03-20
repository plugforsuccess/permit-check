/**
 * Accela Citizen Access scraper using Playwright.
 *
 * The Atlanta portal is JavaScript-rendered — cheerio alone cannot parse it.
 * Uses playwright-core + @sparticuz/chromium for serverless compatibility.
 *
 * Target: https://aca-prod.accela.com/ATLANTA_GA/Default.aspx
 */

import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
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
const BROWSER_TIMEOUT = 15_000;

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.AWS_EXECUTION_ENV
    ? await chromium.executablePath()
    : "/usr/bin/chromium-browser"; // local fallback

  const browser = await playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
  });
  return browser;
}

/**
 * Scrape permit records from the Accela Citizen Access portal for Atlanta.
 */
export async function scrapeAccelaPermits(
  streetNumber: string,
  streetName: string
): Promise<PermitRecord[]> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(BROWSER_TIMEOUT);

    // Step 1: Navigate to the portal homepage to establish session
    console.log("[accela-scraper] Navigating to portal...");
    await page.goto(`${PORTAL_URL}/Default.aspx`, {
      waitUntil: "networkidle",
      timeout: BROWSER_TIMEOUT,
    });

    // Step 2: Navigate to the address search page
    console.log("[accela-scraper] Navigating to search page...");
    await page.goto(
      `${PORTAL_URL}/Cap/CapHome.aspx?module=Building&TabName=Building`,
      {
        waitUntil: "networkidle",
        timeout: BROWSER_TIMEOUT,
      }
    );

    // Step 3: Fill in the address search form
    console.log(
      `[accela-scraper] Searching for: ${streetNumber} ${streetName}`
    );

    // Try to find and fill the street number field
    const streetNumberInput = await findInputField(page, [
      'input[id*="txtHouseNumberFrom"]',
      'input[id*="HouseNumberFrom"]',
      'input[name*="HouseNumberFrom"]',
      'input[id*="txtStreetNo"]',
    ]);

    if (streetNumberInput) {
      await page.fill(streetNumberInput, streetNumber);
    } else {
      console.warn(
        "[accela-scraper] Could not find street number input field"
      );
    }

    // Try to find and fill the street name field
    const streetNameInput = await findInputField(page, [
      'input[id*="txtStreetName"]',
      'input[id*="StreetName"]',
      'input[name*="StreetName"]',
    ]);

    if (streetNameInput) {
      await page.fill(streetNameInput, streetName);
    } else {
      console.warn("[accela-scraper] Could not find street name input field");
    }

    // Step 4: Submit the search
    const searchButton = await findInputField(page, [
      'a[id*="btnNewSearch"]',
      'input[id*="btnSearch"]',
      'button[id*="btnSearch"]',
      'a[id*="btnSearch"]',
      'input[type="submit"][value*="Search"]',
      'button:has-text("Search")',
      'a:has-text("Search")',
    ]);

    if (searchButton) {
      await page.click(searchButton);
    } else {
      console.warn(
        "[accela-scraper] Could not find search button, trying form submit"
      );
      await page.keyboard.press("Enter");
    }

    // Step 5: Wait for results to load
    console.log("[accela-scraper] Waiting for results...");
    try {
      await page.waitForSelector(
        'table[id*="GridView"], div[id*="resultList"], .ACA_Grid_Caption, table[id*="gdvPermitList"]',
        { timeout: BROWSER_TIMEOUT }
      );
    } catch {
      // Results table may not appear — could mean no results or different layout
      console.log(
        "[accela-scraper] No results table found, checking for alternative layouts"
      );
    }

    // Step 6: Parse results
    const permits = await parseResults(page, streetNumber, streetName);

    // If no results, try with full street name (e.g., "Avenue" instead of "Ave")
    if (permits.length === 0) {
      console.log(
        "[accela-scraper] No results found, trying alternate street name formats..."
      );
      const altPermits = await retryWithAlternateNames(
        page,
        streetNumber,
        streetName
      );
      if (altPermits.length > 0) {
        return altPermits;
      }
    }

    console.log(`[accela-scraper] Found ${permits.length} permit records`);
    return permits;
  } catch (error) {
    console.error("[accela-scraper] Scraping failed:", error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Find an input field by trying multiple selectors.
 */
async function findInputField(
  page: Page,
  selectors: string[]
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        return selector;
      }
    } catch {
      // Selector not found, try next
    }
  }
  return null;
}

/**
 * Parse permit records from the results page.
 */
async function parseResults(
  page: Page,
  streetNumber: string,
  streetName: string
): Promise<PermitRecord[]> {
  return page.evaluate(
    ({ streetNum, streetNm }) => {
      const permits: PermitRecord[] = [];
      const address = `${streetNum} ${streetNm}`;

      // Find result rows — Accela uses GridView tables or div-based layouts
      const tables = document.querySelectorAll(
        'table[id*="GridView"], table[id*="gdvPermitList"], table.ACA_Grid_Caption'
      );

      for (const table of tables) {
        const rows = table.querySelectorAll("tr");
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll("td");
          if (cells.length < 3) continue;

          // Extract text from cells — handle links inside cells
          const getText = (cell: Element): string => {
            const link = cell.querySelector("a");
            return (link?.textContent || cell.textContent || "").trim();
          };

          const recordNumber = getText(cells[0]);
          if (!recordNumber || recordNumber === "") continue;

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
            if (s.includes("ISSUED") || s.includes("APPROVED"))
              return "Issued";
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

          const permit: PermitRecord = {
            recordNumber,
            type: cells.length > 1 ? getText(cells[1]) : "Unknown",
            status: cells.length > 2 ? mapStatus(getText(cells[2])) : "Unknown",
            filedDate:
              cells.length > 3 ? parseDate(getText(cells[3])) : null,
            issuedDate:
              cells.length > 4 ? parseDate(getText(cells[4])) : null,
            description:
              cells.length > 5 ? getText(cells[5]) : "",
            address,
          };

          permits.push(permit);
        }
      }

      // Also try div-based result layouts (some Accela configs use divs)
      if (permits.length === 0) {
        const resultDivs = document.querySelectorAll(
          'div[id*="resultList"] .ACA_TabRow, div[id*="resultList"] tr'
        );
        for (const div of resultDivs) {
          const links = div.querySelectorAll("a");
          const spans = div.querySelectorAll("span, td");
          if (links.length === 0 && spans.length === 0) continue;

          const allText = Array.from(spans)
            .map((s) => s.textContent?.trim() || "")
            .filter(Boolean);
          if (allText.length < 2) continue;

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
            if (s.includes("ISSUED") || s.includes("APPROVED"))
              return "Issued";
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

          permits.push({
            recordNumber: links[0]?.textContent?.trim() || allText[0],
            type: allText[1] || "Unknown",
            status: allText[2] ? mapStatus(allText[2]) : "Unknown",
            filedDate: allText[3] ? parseDate(allText[3]) : null,
            issuedDate: allText[4] ? parseDate(allText[4]) : null,
            description: allText[5] || "",
            address,
          });
        }
      }

      return permits;
    },
    { streetNum: streetNumber, streetNm: streetName }
  );
}

/**
 * Retry search with alternate street name formats.
 * E.g., "Ave" → "Avenue", "St" → "Street"
 */
async function retryWithAlternateNames(
  page: Page,
  streetNumber: string,
  streetName: string
): Promise<PermitRecord[]> {
  const expansions: Record<string, string> = {
    Ave: "Avenue",
    St: "Street",
    Blvd: "Boulevard",
    Dr: "Drive",
    Rd: "Road",
    Ln: "Lane",
    Ct: "Court",
    Pl: "Place",
    Pkwy: "Parkway",
  };

  const contractions: Record<string, string> = {
    Avenue: "Ave",
    Street: "St",
    Boulevard: "Blvd",
    Drive: "Dr",
    Road: "Rd",
    Lane: "Ln",
    Court: "Ct",
    Place: "Pl",
    Parkway: "Pkwy",
  };

  // Build alternate name
  let alternateName = streetName;
  let found = false;

  for (const [abbrev, full] of Object.entries(expansions)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, "i");
    if (regex.test(streetName)) {
      alternateName = streetName.replace(regex, full);
      found = true;
      break;
    }
  }

  if (!found) {
    for (const [full, abbrev] of Object.entries(contractions)) {
      const regex = new RegExp(`\\b${full}\\b`, "i");
      if (regex.test(streetName)) {
        alternateName = streetName.replace(regex, abbrev);
        found = true;
        break;
      }
    }
  }

  if (!found || alternateName === streetName) return [];

  console.log(
    `[accela-scraper] Retrying with alternate name: ${streetNumber} ${alternateName}`
  );

  // Navigate back to search and retry
  try {
    await page.goto(
      `${PORTAL_URL}/Cap/CapHome.aspx?module=Building&TabName=Building`,
      {
        waitUntil: "networkidle",
        timeout: BROWSER_TIMEOUT,
      }
    );

    const streetNumberInput = await findInputField(page, [
      'input[id*="txtHouseNumberFrom"]',
      'input[id*="HouseNumberFrom"]',
      'input[name*="HouseNumberFrom"]',
    ]);

    const streetNameInput = await findInputField(page, [
      'input[id*="txtStreetName"]',
      'input[id*="StreetName"]',
      'input[name*="StreetName"]',
    ]);

    if (streetNumberInput) await page.fill(streetNumberInput, streetNumber);
    if (streetNameInput) await page.fill(streetNameInput, alternateName);

    const searchButton = await findInputField(page, [
      'a[id*="btnNewSearch"]',
      'input[id*="btnSearch"]',
      'button[id*="btnSearch"]',
      'a[id*="btnSearch"]',
      'input[type="submit"][value*="Search"]',
    ]);

    if (searchButton) {
      await page.click(searchButton);
    } else {
      await page.keyboard.press("Enter");
    }

    try {
      await page.waitForSelector(
        'table[id*="GridView"], div[id*="resultList"], .ACA_Grid_Caption, table[id*="gdvPermitList"]',
        { timeout: BROWSER_TIMEOUT }
      );
    } catch {
      // No results table
    }

    return parseResults(page, streetNumber, alternateName);
  } catch {
    return [];
  }
}
