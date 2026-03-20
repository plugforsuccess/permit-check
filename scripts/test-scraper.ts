/**
 * scripts/test-scraper.ts
 *
 * Standalone scraper debug script. Runs the Playwright browser visibly
 * (headful) against the live Atlanta portal and dumps everything needed
 * to identify correct selectors — without touching Next.js or Supabase.
 *
 * Run with: npx tsx scripts/test-scraper.ts
 *
 * Outputs:
 *   scripts/scraper-debug.png  — full-page screenshot of results page
 *   scripts/scraper-debug.html — full DOM of results page for DevTools inspection
 */
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import * as fs from "fs";

const PORTAL_URL = "https://aca-prod.accela.com/ATLANTA_GA";
const BROWSER_TIMEOUT = 20_000;

// Atlanta City Hall — known to have many permit records.
// If this returns zero, something is broken in form submission or selectors.
const TEST_STREET_NUMBER = "55";
const TEST_STREET_NAME = "Trinity Ave SW";

async function main() {
  console.log("\n=== Accela Scraper Debug ===\n");
  console.log("Launching headful browser...");

  const browser = await playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: false, // headful so you can watch what happens
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(BROWSER_TIMEOUT);

  try {
    // ── Step 1: Portal homepage ──────────────────────────────────────────────
    console.log("[1] Loading portal homepage...");
    await page.goto(`${PORTAL_URL}/Default.aspx`, {
      waitUntil: "networkidle",
      timeout: BROWSER_TIMEOUT,
    });
    console.log("    Title:", await page.title());

    // ── Step 2: Building search page ─────────────────────────────────────────
    console.log("[2] Navigating to Building search...");
    await page.goto(
      `${PORTAL_URL}/Cap/CapHome.aspx?module=Building&TabName=Building`,
      { waitUntil: "networkidle", timeout: BROWSER_TIMEOUT }
    );
    console.log("    Title:", await page.title());

    // ── Step 3: Dump all input fields ────────────────────────────────────────
    console.log("\n[3] Input fields on search page:");
    const inputs = await page.$$eval("input, select", (els) =>
      els.map((el) => ({
        tag: el.tagName,
        id: el.id || "(no id)",
        name: (el as HTMLInputElement).name || "(no name)",
        type: (el as HTMLInputElement).type || "(no type)",
        placeholder: (el as HTMLInputElement).placeholder || "",
      }))
    );
    console.log(JSON.stringify(inputs, null, 2));

    // ── Step 4: Fill street number ───────────────────────────────────────────
    const numberSelectors = [
      'input[id*="txtHouseNumberFrom"]',
      'input[id*="HouseNumberFrom"]',
      'input[name*="HouseNumberFrom"]',
      'input[id*="txtStreetNo"]',
      'input[id*="StreetNumber"]',
    ];

    let usedNumberSelector: string | null = null;
    for (const sel of numberSelectors) {
      if (await page.$(sel)) {
        await page.fill(sel, TEST_STREET_NUMBER);
        usedNumberSelector = sel;
        break;
      }
    }

    if (usedNumberSelector) {
      console.log(`\n[4] Street number filled via: ${usedNumberSelector}`);
    } else {
      console.log("\n[4] WARNING: Street number input not found");
      console.log("    Check [3] output above for the correct id/name");
    }

    // ── Step 5: Fill street name ─────────────────────────────────────────────
    const nameSelectors = [
      'input[id*="txtStreetName"]',
      'input[id*="StreetName"]',
      'input[name*="StreetName"]',
    ];

    let usedNameSelector: string | null = null;
    for (const sel of nameSelectors) {
      if (await page.$(sel)) {
        await page.fill(sel, TEST_STREET_NAME);
        usedNameSelector = sel;
        break;
      }
    }

    if (usedNameSelector) {
      console.log(`[5] Street name filled via: ${usedNameSelector}`);
    } else {
      console.log("[5] WARNING: Street name input not found");
    }

    // ── Step 6: Submit ───────────────────────────────────────────────────────
    const submitSelectors = [
      'a[id*="btnNewSearch"]',
      'input[id*="btnSearch"]',
      'button[id*="btnSearch"]',
      'a[id*="btnSearch"]',
      'input[type="submit"][value*="Search"]',
      'button:has-text("Search")',
      'a:has-text("Search")',
    ];

    let usedSubmitSelector: string | null = null;
    for (const sel of submitSelectors) {
      if (await page.$(sel)) {
        await page.click(sel);
        usedSubmitSelector = sel;
        break;
      }
    }

    if (usedSubmitSelector) {
      console.log(`[6] Search submitted via: ${usedSubmitSelector}`);
    } else {
      console.log("[6] WARNING: Search button not found — pressing Enter");
      await page.keyboard.press("Enter");
    }

    // ── Step 7: Wait for results ─────────────────────────────────────────────
    console.log("\n[7] Waiting for results page...");
    await page.waitForLoadState("networkidle", { timeout: BROWSER_TIMEOUT });
    await page.waitForTimeout(2000);

    // ── Step 8: Screenshot ───────────────────────────────────────────────────
    await page.screenshot({ path: "scripts/scraper-debug.png", fullPage: true });
    console.log("[8] Screenshot saved → scripts/scraper-debug.png");

    // ── Step 9: Save HTML ────────────────────────────────────────────────────
    const html = await page.content();
    fs.writeFileSync("scripts/scraper-debug.html", html);
    console.log("[9] Full HTML saved → scripts/scraper-debug.html");
    console.log("    Open in Chrome + DevTools to inspect the actual DOM");

    // ── Step 10: Dump all tables on results page ─────────────────────────────
    console.log("\n[10] Tables found on results page:");
    const tables = await page.$$eval("table", (tbls) =>
      tbls.map((t) => ({
        id: t.id || "(no id)",
        className: t.className || "(no class)",
        rowCount: t.rows.length,
        firstRowText: t.rows[0]?.innerText?.slice(0, 120) || "",
      }))
    );
    console.log(JSON.stringify(tables, null, 2));

    // ── Step 11: Try current selectors ──────────────────────────────────────
    console.log("\n[11] Attempting parse with current scraper selectors...");
    const { matched, rowCount } = await page.evaluate(() => {
      const tables = document.querySelectorAll(
        'table[id*="GridView"], table[id*="gdvPermitList"], table.ACA_Grid_Caption'
      );
      let rowCount = 0;
      tables.forEach((t) => {
        rowCount += t.querySelectorAll("tr").length - 1; // subtract header
      });
      return { matched: tables.length, rowCount };
    });

    if (rowCount > 0) {
      console.log(`    ✓ SUCCESS: ${matched} table(s) matched, ${rowCount} data row(s) found`);
      console.log("    Current selectors work — no changes needed in scraper.ts");
    } else {
      console.log(`    ✗ FAIL: ${matched} table(s) matched but 0 data rows parsed`);
      console.log("    → Open scripts/scraper-debug.html in Chrome DevTools");
      console.log("    → Search for the permit record number you expect");
      console.log("    → Note the actual table id/class and update scraper.ts");
    }

    // ── Step 12: Try div-based fallback ─────────────────────────────────────
    const divRows = await page.evaluate(() => {
      return document.querySelectorAll(
        'div[id*="resultList"] .ACA_TabRow, div[id*="resultList"] tr'
      ).length;
    });
    console.log(`\n[12] Div-based fallback rows found: ${divRows}`);
    if (divRows > 0 && rowCount === 0) {
      console.log("    Div layout detected — scraper div-fallback path should handle this");
    }

  } finally {
    console.log("\nKeeping browser open 10s for manual inspection...");
    await page.waitForTimeout(10_000);
    await browser.close();
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
