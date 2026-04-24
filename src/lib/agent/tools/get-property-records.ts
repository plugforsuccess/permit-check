import { z } from "zod";
import { fetchPropertyData, type PropertyData } from "@/lib/property-data";
import type { ToolDefinition } from "./types";

export const getPropertyRecordsInputSchema = z.object({
  address: z.string().min(1),
});

export interface GetPropertyRecordsOutput {
  property: PropertyData | null;
  source: "reapi" | "unavailable";
}

export function buildGetPropertyRecordsTool(
  overrideFetch?: typeof fetchPropertyData
): ToolDefinition<typeof getPropertyRecordsInputSchema, GetPropertyRecordsOutput> {
  const fetch = overrideFetch ?? fetchPropertyData;
  return {
    name: "get_property_records",
    description:
      "Fetches property records: ownership history, sale prices, assessed value, square footage, year built, and property classification.",
    inputSchema: getPropertyRecordsInputSchema,
    async execute(input) {
      const property = await fetch(input.address);
      return {
        property,
        source: property ? "reapi" : "unavailable",
      };
    },
  };
}
