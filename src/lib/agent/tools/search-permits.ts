import { z } from "zod";
import { scrapeAccelaPermits, type PermitRecord } from "@/lib/accela";
import { normalizeAddress as normalizeAccelaAddress } from "@/lib/accela/normalize";
import type { ToolDefinition } from "./types";

export const searchPermitsInputSchema = z.object({
  address: z.string().min(1),
  jurisdiction: z.enum(["ATLANTA_GA", "GWINNETT_GA"]).default("ATLANTA_GA"),
  lookback_years: z.number().int().min(1).max(100).default(25),
});

export type SearchPermitsInput = z.infer<typeof searchPermitsInputSchema>;

export interface SearchPermitsOutput {
  permits: PermitRecord[];
  truncated: boolean;
  usedFuzzyMatch: boolean;
  source: "live_scrape";
}

/**
 * Wraps the existing Accela scraper. The agent uses this as its single
 * permit-lookup tool; caching & jurisdiction-routing live in the scraper
 * and jurisdictions module. Callers can override the scraper in tests by
 * passing `overrideScrape`.
 */
export function buildSearchPermitsTool(overrideScrape?: typeof scrapeAccelaPermits): ToolDefinition<
  typeof searchPermitsInputSchema,
  SearchPermitsOutput
> {
  const scrape = overrideScrape ?? scrapeAccelaPermits;
  return {
    name: "search_permits",
    description:
      "Search permit records for a property. Returns structured permit records including record number, type, status, filed/issued dates, description, and (for high-signal permits) inspection history.",
    inputSchema: searchPermitsInputSchema,
    async execute(input) {
      const { streetNumber, streetName } = normalizeAccelaAddress(input.address);
      if (!streetNumber || !streetName) {
        return {
          permits: [],
          truncated: false,
          usedFuzzyMatch: false,
          source: "live_scrape",
        };
      }
      const result = await scrape(streetNumber, streetName, input.jurisdiction);
      return { ...result, source: "live_scrape" };
    },
  };
}
