import { describe, it, expect } from "vitest";
import {
  searchPermitsInputSchema,
  getPropertyRecordsInputSchema,
  getContractorRecordInputSchema,
  getCodeViolationsInputSchema,
  compareFootprintInputSchema,
  getPermitDocumentInputSchema,
  jurisdictionSchema,
} from "../lib/agent/schemas";

/**
 * Smoke tests for the six tool input schemas. Catches typos and shape
 * regressions per PR3 acceptance: "one Zod parse smoke test per tool".
 *
 * Real implementations land in PR5+ — these tests verify the schemas
 * accept the shapes documented in SPEC §10 and reject obviously malformed
 * input.
 */

describe("agent tool schemas — smoke", () => {
  it("jurisdictionSchema accepts the five supported values", () => {
    for (const j of ["atlanta", "gwinnett", "dekalb", "fulton", "cobb"]) {
      expect(jurisdictionSchema.parse(j)).toBe(j);
    }
    expect(() => jurisdictionSchema.parse("savannah")).toThrow();
  });

  it("search_permits accepts the SPEC §10 example shape", () => {
    const parsed = searchPermitsInputSchema.parse({
      parcel_id: "14-0079-0001-001-9",
      jurisdiction: "atlanta",
      lookback_years: 25,
    });
    expect(parsed.lookback_years).toBe(25);
  });

  it("search_permits applies the 25-year default lookback", () => {
    const parsed = searchPermitsInputSchema.parse({ jurisdiction: "atlanta" });
    expect(parsed.lookback_years).toBe(25);
  });

  it("get_property_records requires both parcel_id and jurisdiction", () => {
    expect(() =>
      getPropertyRecordsInputSchema.parse({ parcel_id: "14-0079" })
    ).toThrow();
    expect(() =>
      getPropertyRecordsInputSchema.parse({ jurisdiction: "atlanta" })
    ).toThrow();
    expect(
      getPropertyRecordsInputSchema.parse({
        parcel_id: "14-0079",
        jurisdiction: "atlanta",
      })
    ).toBeTruthy();
  });

  it("get_contractor_record requires at least one of license_number or business_name", () => {
    expect(() => getContractorRecordInputSchema.parse({})).toThrow();
    expect(
      getContractorRecordInputSchema.parse({ license_number: "GC-12345" })
    ).toBeTruthy();
    expect(
      getContractorRecordInputSchema.parse({ business_name: "Acme Builders" })
    ).toBeTruthy();
  });

  it("get_code_violations requires address + jurisdiction", () => {
    expect(
      getCodeViolationsInputSchema.parse({
        address: "1278 GREENWICH ST SW",
        jurisdiction: "atlanta",
      })
    ).toBeTruthy();
    expect(() =>
      getCodeViolationsInputSchema.parse({ address: "1278 GREENWICH ST SW" })
    ).toThrow();
  });

  it("compare_footprint_to_permits requires parcel_id + jurisdiction", () => {
    expect(
      compareFootprintInputSchema.parse({
        parcel_id: "14-0079",
        jurisdiction: "atlanta",
      })
    ).toBeTruthy();
  });

  it("get_permit_document requires permit_id", () => {
    expect(
      getPermitDocumentInputSchema.parse({ permit_id: "BP-2024-001" })
    ).toBeTruthy();
    expect(() => getPermitDocumentInputSchema.parse({})).toThrow();
  });
});
