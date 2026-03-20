/**
 * Discovery Bot — finds Accela portal URLs for a list of jurisdictions.
 *
 * Usage: npx tsx scripts/discover-jurisdictions.ts
 *
 * Outputs: scripts/discovered-jurisdictions.json
 */

import * as fs from "fs";

const TARGETS = [
  // Georgia metro
  "Cobb County Georgia building permits",
  "DeKalb County Georgia building permits",
  "Sandy Springs Georgia building permits",
  "Brookhaven Georgia building permits",
  "Decatur Georgia building permits",
  "Marietta Georgia building permits",
  "Alpharetta Georgia building permits",
  "Roswell Georgia building permits",
  "Johns Creek Georgia building permits",
  "Dunwoody Georgia building permits",
  "Smyrna Georgia building permits",
  "Kennesaw Georgia building permits",
  "Peachtree City Georgia building permits",
  "Rockdale County Georgia building permits",
  "Henry County Georgia building permits",
  "Clayton County Georgia building permits",
  "Douglas County Georgia building permits",
  "Newton County Georgia building permits",
  // Add more cities here as you expand nationally
];

// Known Accela URL patterns
const ACCELA_PATTERNS = [
  /aca-prod\.accela\.com\/([A-Z_]+)/i,
  /citizenaccess\.[a-z.]+\.(gov|com|us|org)/i,
  /accela\.[a-z.]+\.(gov|com|us|org)/i,
  /permits\.[a-z.]+\.(gov|com|us|org)/i,
];

interface DiscoveredJurisdiction {
  query: string;
  portalUrl: string | null;
  agencyCode: string | null;
  confidence: "high" | "medium" | "low";
  note: string;
}

async function searchForPortal(query: string): Promise<string[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) {
    throw new Error("Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID");
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `${query} accela citizen access portal`);
  url.searchParams.set("num", "10");

  const res = await fetch(url.toString());
  const data = await res.json();

  return (data.items ?? []).map((item: { link: string }) => item.link);
}

async function validatePortal(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    // Accela portals return 200 even for login pages
    return res.ok;
  } catch {
    return false;
  }
}

function extractAgencyCode(url: string): string | null {
  const match = url.match(/aca-prod\.accela\.com\/([^/]+)/i);
  return match ? match[1].toUpperCase() : null;
}

function classifyConfidence(url: string): "high" | "medium" | "low" {
  if (url.includes("aca-prod.accela.com")) return "high";
  if (ACCELA_PATTERNS.slice(1).some((p) => p.test(url))) return "medium";
  return "low";
}

async function main() {
  console.log(`\nDiscovery Bot — searching ${TARGETS.length} jurisdictions\n`);

  const results: DiscoveredJurisdiction[] = [];

  for (const query of TARGETS) {
    process.stdout.write(`Searching: ${query}... `);

    try {
      const urls = await searchForPortal(query);

      // Find the best Accela URL from results
      let bestUrl: string | null = null;
      let bestConfidence: "high" | "medium" | "low" = "low";

      for (const url of urls) {
        const confidence = classifyConfidence(url);
        if (
          confidence === "high" ||
          (confidence === "medium" && bestConfidence === "low")
        ) {
          bestUrl = url;
          bestConfidence = confidence;
          if (confidence === "high") break;
        }
      }

      if (bestUrl) {
        const valid = await validatePortal(bestUrl);
        const agencyCode = extractAgencyCode(bestUrl);

        results.push({
          query,
          portalUrl: bestUrl,
          agencyCode,
          confidence: bestConfidence,
          note: valid ? "reachable" : "unreachable",
        });

        console.log(
          `✓ ${bestConfidence} confidence — ${agencyCode ?? bestUrl}`
        );
      } else {
        results.push({
          query,
          portalUrl: null,
          agencyCode: null,
          confidence: "low",
          note: "no accela portal found",
        });
        console.log("✗ not found");
      }

      // Rate limit — 1 request per second to avoid API quota
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.log(`✗ error: ${err}`);
      results.push({
        query,
        portalUrl: null,
        agencyCode: null,
        confidence: "low",
        note: `error: ${err}`,
      });
    }
  }

  // Write results
  fs.writeFileSync(
    "scripts/discovered-jurisdictions.json",
    JSON.stringify(results, null, 2)
  );

  // Summary
  const found = results.filter((r) => r.portalUrl);
  const high = results.filter((r) => r.confidence === "high");
  console.log(`\nResults:`);
  console.log(`  ${found.length}/${results.length} jurisdictions found`);
  console.log(`  ${high.length} high confidence (standard aca-prod.accela.com)`);
  console.log(`\nSaved to scripts/discovered-jurisdictions.json`);
  console.log(`Run the Selector Verification Bot on high-confidence results next.`);
}

main().catch(console.error);
