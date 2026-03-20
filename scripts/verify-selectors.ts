/**
 * Selector Verification Bot — generates JurisdictionConfig for each portal.
 *
 * Usage: npx tsx scripts/verify-selectors.ts
 *
 * Input:  scripts/discovered-jurisdictions.json (from Discovery Bot)
 * Output: scripts/verified-configs.json + screenshots in scripts/screenshots/
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright-core";

// Test address to use for each jurisdiction — a government building that
// should exist in any US city's permit database
const TEST_ADDRESSES: Record<string, { number: string; street: string }> = {
  // Overrides for specific jurisdictions
  GWINNETT: { number: "75", street: "Langley Dr" },
  ATLANTA_GA: { number: "55", street: "Trinity Ave SW" },
  // Default: use the county courthouse
  DEFAULT: { number: "1", street: "Courthouse" },
};

interface DiscoveredJurisdiction {
  query: string;
  portalUrl: string | null;
  agencyCode: string | null;
  confidence: "high" | "medium" | "low";
  note: string;
}

interface ColumnMap {
  filedDate: number;
  recordNumber: number;
  recordType: number;
  description: number;
  permitName: number;
  status: number;
  address: number;
}

interface VerifiedConfig {
  agencyCode: string;
  portalUrl: string;
  searchUrl: string;
  hasQuadrant: boolean;
  hasDateRange: boolean;
  hasStartDateField: boolean;
  streetNumberSelector: string;
  streetNameSelector: string;
  streetSuffixSelector: string | null;
  quadrantSelector: string | null;
  startDateSelector: string | null;
  endDateSelector: string | null;
  searchButtonSelector: string;
  resultsTableSelector: string;
  nextPageSelector: string | null;
  nextPageText: string | null;
  columnMap: ColumnMap;
  testResultCount: number;
  screenshotPath: string;
  status: "success" | "partial" | "failed";
  notes: string[];
}

async function verifyJurisdiction(
  jurisdiction: DiscoveredJurisdiction
): Promise<VerifiedConfig | null> {
  if (!jurisdiction.portalUrl || !jurisdiction.agencyCode) return null;

  const agencyCode = jurisdiction.agencyCode;
  const notes: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  const screenshotDir = "scripts/screenshots";
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);
  const screenshotPath = path.join(screenshotDir, `${agencyCode}.png`);

  try {
    // Determine search URL — try Building module
    const baseUrl = jurisdiction.portalUrl.replace(/\/+$/, "").split("/Cap/")[0];
    const searchUrl = `${baseUrl}/Cap/CapHome.aspx?module=Building&customglobalsearch=true`;

    console.log(`  Navigating to ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 20000 });

    // Dump all form fields
    const fields = await page.$$eval("input, select", (els) =>
      els
        .filter((el) => el.id || (el as HTMLInputElement).name)
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          name: (el as HTMLInputElement).name,
          type: (el as HTMLInputElement).type,
        }))
    );

    // Identify key selectors
    const streetNumberField = fields.find(
      (f) =>
        f.id.includes("txtGSNumber_ChildControl0") ||
        f.id.includes("txtHouseNumberFrom")
    );
    const streetNameField = fields.find(
      (f) =>
        f.id.includes("txtGSStreetName") || f.id.includes("txtStreetName")
    );
    const suffixField = fields.find(
      (f) =>
        f.tag === "SELECT" &&
        (f.id.includes("ddlGSStreetSuffix") || f.id.includes("StreetSuffix"))
    );
    const quadrantField = fields.find(
      (f) =>
        f.tag === "SELECT" &&
        (f.id.includes("ddlGSStreetSuffixDirection") ||
          f.id.includes("Quadrant") ||
          f.id.includes("Direction"))
    );
    const startDateField = fields.find((f) =>
      f.id.includes("txtGSStartDate")
    );
    const endDateField = fields.find((f) =>
      f.id.includes("txtGSEndDate")
    );

    if (!streetNumberField || !streetNameField) {
      notes.push("Could not find street number or street name fields");
    }

    // Find search button
    const searchButton = await page.$("a#ctl00_PlaceHolderMain_btnNewSearch");
    const searchButtonSelector = searchButton
      ? "#ctl00_PlaceHolderMain_btnNewSearch"
      : "a[id*='btnNewSearch']";

    // Get test address for this jurisdiction
    const testAddr =
      TEST_ADDRESSES[agencyCode] ?? TEST_ADDRESSES.DEFAULT;

    // Fill the form
    if (streetNumberField) {
      await page.click(`#${streetNumberField.id}`);
      await page.fill(`#${streetNumberField.id}`, testAddr.number);
    }
    if (streetNameField) {
      await page.click(`#${streetNameField.id}`);
      await page.fill(`#${streetNameField.id}`, testAddr.street);
    }

    // Widen date range if available
    if (startDateField) {
      await page.fill(`#${startDateField.id}`, "01/01/2000");
    }

    // Submit
    await page.click(searchButtonSelector);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Find results table
    const tableId = await page.evaluate(() => {
      const tables = document.querySelectorAll("table");
      let bestTable: Element | null = null;
      let maxRows = 0;
      tables.forEach((t) => {
        if (
          t.id.includes("dgvPermitList") ||
          t.id.includes("gdvPermitList") ||
          t.id.includes("GridView")
        ) {
          bestTable = t;
        } else if (t.rows.length > maxRows && t.rows.length > 3) {
          maxRows = t.rows.length;
          bestTable = t;
        }
      });
      return bestTable ? (bestTable as HTMLElement).id : null;
    });

    const resultsTableSelector = tableId
      ? `#${tableId}`
      : "#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList";

    // Dump first data row cells
    const cells = await page.evaluate((selector) => {
      const table = document.querySelector(selector) as HTMLTableElement;
      if (!table || table.rows.length < 3) return [];
      const row = table.rows[2];
      return Array.from(row.cells).map((c, i) => ({
        index: i,
        text: (c.innerText || "").trim().slice(0, 60),
      }));
    }, resultsTableSelector);

    const resultCount = await page.evaluate((selector) => {
      const table = document.querySelector(selector) as HTMLTableElement;
      return table ? table.rows.length - 2 : 0; // subtract header rows
    }, resultsTableSelector);

    // Auto-detect column mapping from cell text patterns
    const columnMap: ColumnMap = {
      filedDate: -1,
      recordNumber: -1,
      recordType: -1,
      description: -1,
      permitName: -1,
      status: -1,
      address: -1,
    };

    for (const cell of cells) {
      const text = cell.text.toLowerCase();
      // Record number pattern: letters + hyphen + numbers
      if (/^[a-z]{2,4}-\d{4}-\d+/i.test(cell.text) || /^[a-z]+\d{4}-\d+/i.test(cell.text)) {
        columnMap.recordNumber = cell.index;
      }
      // Date pattern: MM/DD/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}/.test(cell.text) && columnMap.filedDate === -1) {
        columnMap.filedDate = cell.index;
      }
      // Status keywords
      if (["issued", "expired", "finaled", "void", "pending", "review", "closed"].some(s => text === s)) {
        columnMap.status = cell.index;
      }
      // Address pattern: starts with number followed by street
      if (/^\d+\s+[a-z]/i.test(cell.text) && cell.text.includes(",")) {
        columnMap.address = cell.index;
      }
    }

    // Find next page selector
    const nextPageInfo = await page.evaluate(() => {
      // Check standard Accela pagination
      const standardNext = document.querySelector("a.aca_pagination_PagerNextStyle");
      if (standardNext) return { selector: "a.aca_pagination_PagerNextStyle", text: null };

      // Check text-based next links
      const links = Array.from(document.querySelectorAll("a"));
      const nextLink = links.find(
        (a) => a.innerText.trim() === "Next >" || a.innerText.trim() === "Next"
      );
      if (nextLink) return { selector: null, text: nextLink.innerText.trim() };

      return { selector: null, text: null };
    });

    notes.push(`Found ${cells.length} cells in first data row`);
    notes.push(`Test search returned ~${resultCount} records on first page`);
    if (cells.length > 0) {
      notes.push(`Column map: ${JSON.stringify(columnMap)}`);
    }

    return {
      agencyCode,
      portalUrl: jurisdiction.portalUrl,
      searchUrl,
      hasQuadrant: !!quadrantField,
      hasDateRange: !!(startDateField && endDateField),
      hasStartDateField: !!startDateField,
      streetNumberSelector: streetNumberField
        ? `#${streetNumberField.id}`
        : "#ctl00_PlaceHolderMain_generalSearchForm_txtGSNumber_ChildControl0",
      streetNameSelector: streetNameField
        ? `#${streetNameField.id}`
        : "#ctl00_PlaceHolderMain_generalSearchForm_txtGSStreetName",
      streetSuffixSelector: suffixField ? `#${suffixField.id}` : null,
      quadrantSelector: quadrantField ? `#${quadrantField.id}` : null,
      startDateSelector: startDateField ? `#${startDateField.id}` : null,
      endDateSelector: endDateField ? `#${endDateField.id}` : null,
      searchButtonSelector,
      resultsTableSelector,
      nextPageSelector: nextPageInfo?.selector ?? null,
      nextPageText: nextPageInfo?.text ?? null,
      columnMap,
      testResultCount: resultCount,
      screenshotPath,
      status: columnMap.recordNumber >= 0 ? "success" : "partial",
      notes,
    };
  } catch (err) {
    notes.push(`Error: ${err}`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    return {
      agencyCode,
      portalUrl: jurisdiction.portalUrl,
      searchUrl: "",
      hasQuadrant: false,
      hasDateRange: false,
      hasStartDateField: false,
      streetNumberSelector: "",
      streetNameSelector: "",
      streetSuffixSelector: null,
      quadrantSelector: null,
      startDateSelector: null,
      endDateSelector: null,
      searchButtonSelector: "",
      resultsTableSelector: "",
      nextPageSelector: null,
      nextPageText: null,
      columnMap: {
        filedDate: -1, recordNumber: -1, recordType: -1,
        description: -1, permitName: -1, status: -1, address: -1,
      },
      testResultCount: 0,
      screenshotPath,
      status: "failed",
      notes,
    };
  } finally {
    await browser.close();
  }
}

function generateJurisdictionConfig(config: VerifiedConfig): string {
  return `  ${config.agencyCode}: {
    id: "${config.agencyCode}",
    name: "${config.agencyCode.replace(/_/g, " ").replace(/GA$/, "").trim()}",
    state: "GA",
    portalUrl: "${config.portalUrl}",
    searchUrl: "${config.searchUrl}",
    hasQuadrant: ${config.hasQuadrant},
    hasDateRange: ${config.hasDateRange},
    columnMap: {
      filedDate:    ${config.columnMap.filedDate},
      recordNumber: ${config.columnMap.recordNumber},
      recordType:   ${config.columnMap.recordType},
      description:  ${config.columnMap.description},
      permitName:   ${config.columnMap.permitName},
      status:       ${config.columnMap.status},
      address:      ${config.columnMap.address},
    },
  },`;
}

async function main() {
  const input = JSON.parse(
    fs.readFileSync("scripts/discovered-jurisdictions.json", "utf8")
  ) as DiscoveredJurisdiction[];

  const targets = input.filter(
    (j) => j.confidence === "high" && j.portalUrl && j.note === "reachable"
  );

  console.log(`\nSelector Verification Bot`);
  console.log(`Processing ${targets.length} high-confidence jurisdictions\n`);

  const configs: VerifiedConfig[] = [];

  for (const jurisdiction of targets) {
    console.log(`[${jurisdiction.agencyCode}] Verifying...`);
    const config = await verifyJurisdiction(jurisdiction);
    if (config) {
      configs.push(config);
      console.log(`  Status: ${config.status}`);
      console.log(`  Notes: ${config.notes.join(" | ")}`);
    }
    // Pause between jurisdictions to avoid rate limiting
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Save full results
  fs.writeFileSync(
    "scripts/verified-configs.json",
    JSON.stringify(configs, null, 2)
  );

  // Generate ready-to-paste JurisdictionConfig entries
  const successful = configs.filter((c) => c.status === "success");
  const configCode = successful.map(generateJurisdictionConfig).join("\n\n");

  fs.writeFileSync(
    "scripts/generated-jurisdiction-configs.ts",
    `// Auto-generated by verify-selectors.ts — review before committing\n// ${successful.length} jurisdictions ready to add\n\n${configCode}\n`
  );

  console.log(`\nResults:`);
  console.log(`  ${configs.filter((c) => c.status === "success").length} success`);
  console.log(`  ${configs.filter((c) => c.status === "partial").length} partial (manual review needed)`);
  console.log(`  ${configs.filter((c) => c.status === "failed").length} failed`);
  console.log(`\nFiles saved:`);
  console.log(`  scripts/verified-configs.json — full results`);
  console.log(`  scripts/generated-jurisdiction-configs.ts — paste into jurisdictions.ts`);
  console.log(`  scripts/screenshots/ — visual verification`);
  console.log(`\nFor partial/failed: check screenshots and manually verify column mapping.`);
}

main().catch(console.error);
