import { describe, it, expect } from "vitest";
import { detectJurisdiction, JURISDICTIONS } from "../lib/accela/jurisdictions";

describe("detectJurisdiction", () => {
  it("detects Atlanta by zip code", () => {
    expect(detectJurisdiction("55 Trinity Ave SW, Atlanta, GA 30303")).toBe(
      "ATLANTA_GA"
    );
    expect(detectJurisdiction("100 Main St, Atlanta, GA 30309")).toBe(
      "ATLANTA_GA"
    );
  });

  it("detects Gwinnett by zip code", () => {
    expect(
      detectJurisdiction("123 Main St, Lawrenceville, GA 30043")
    ).toBe("GWINNETT_GA");
    expect(
      detectJurisdiction("456 Oak Dr, Duluth, GA 30096")
    ).toBe("GWINNETT_GA");
  });

  it("defaults to Atlanta for unrecognized zip", () => {
    expect(detectJurisdiction("100 Main St, Savannah, GA 31401")).toBe(
      "ATLANTA_GA"
    );
  });

  it("defaults to Atlanta when no zip present", () => {
    expect(detectJurisdiction("55 TRINITY AVE SW")).toBe("ATLANTA_GA");
  });

  it("has valid config for each jurisdiction", () => {
    for (const [id, config] of Object.entries(JURISDICTIONS)) {
      expect(config.id).toBe(id);
      expect(config.name).toBeTruthy();
      expect(config.searchUrl).toContain("https://");
      expect(config.resultsTableSelector).toBeTruthy();
    }
  });
});
