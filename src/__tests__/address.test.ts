import { describe, it, expect } from "vitest";
import { normalizeAddress, validateAddress, detectUnitAddress, detectPropertyContext } from "../lib/address";

describe("normalizeAddress", () => {
  it("normalizes street type abbreviations", () => {
    expect(normalizeAddress("55 Trinity Avenue SW")).toBe("55 TRINITY AVE SW");
    expect(normalizeAddress("130 Peachtree Street NW")).toBe("130 PEACHTREE ST NW");
  });

  it("normalizes directional abbreviations", () => {
    expect(normalizeAddress("100 Main St southwest")).toBe("100 MAIN ST SW");
    expect(normalizeAddress("200 Oak Dr northeast")).toBe("200 OAK DR NE");
  });

  it("strips apartment/unit/suite info", () => {
    expect(normalizeAddress("55 Trinity Ave SW Apt 4")).toBe("55 TRINITY AVE SW");
    expect(normalizeAddress("100 Main St Unit B")).toBe("100 MAIN ST");
    expect(normalizeAddress("200 Oak Dr STE 300")).toBe("200 OAK DR");
  });

  it("strips city, state, zip for Atlanta addresses", () => {
    expect(normalizeAddress("55 Trinity Ave SW, Atlanta, GA 30303")).toBe(
      "55 TRINITY AVE SW"
    );
    expect(normalizeAddress("55 Trinity Ave SW, Atlanta GA")).toBe(
      "55 TRINITY AVE SW"
    );
  });

  it("handles already-normalized addresses", () => {
    expect(normalizeAddress("55 TRINITY AVE SW")).toBe("55 TRINITY AVE SW");
  });

  it("trims whitespace", () => {
    expect(normalizeAddress("  55 Trinity Ave SW  ")).toBe("55 TRINITY AVE SW");
  });
});

describe("validateAddress", () => {
  it("accepts valid addresses", () => {
    expect(validateAddress("55 Trinity Ave")).toEqual({ valid: true });
    expect(validateAddress("130 Peachtree St NW")).toEqual({ valid: true });
  });

  it("rejects empty addresses", () => {
    const result = validateAddress("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects addresses without street number", () => {
    const result = validateAddress("Main Street");
    expect(result.valid).toBe(false);
  });

  it("rejects single-word addresses", () => {
    const result = validateAddress("123");
    expect(result.valid).toBe(false);
  });
});

describe("detectUnitAddress", () => {
  it("detects unit addresses", () => {
    expect(detectUnitAddress("1234 Peachtree St NE Unit 5")).toEqual({
      isUnit: true,
      baseAddress: "1234 PEACHTREE ST NE",
    });
    expect(detectUnitAddress("456 Main St Apt 2B")).toEqual({
      isUnit: true,
      baseAddress: "456 MAIN ST",
    });
    expect(detectUnitAddress("789 Oak Ave #101")).toEqual({
      isUnit: true,
      baseAddress: "789 OAK AVE",
    });
    expect(detectUnitAddress("860 Peachtree St NE Suite 300")).toEqual({
      isUnit: true,
      baseAddress: "860 PEACHTREE ST NE",
    });
  });

  it("returns isUnit false for non-unit addresses", () => {
    expect(detectUnitAddress("321 Elm St")).toEqual({
      isUnit: false,
      baseAddress: "321 ELM ST",
    });
    expect(detectUnitAddress("55 Trinity Ave SW")).toEqual({
      isUnit: false,
      baseAddress: "55 TRINITY AVE SW",
    });
  });
});

describe("detectPropertyContext", () => {
  it("detects new construction from year built", () => {
    const currentYear = new Date().getFullYear();
    const result = detectPropertyContext("100 New St", currentYear - 2);
    expect(result.isNewConstruction).toBe(true);
    expect(result.isUnit).toBe(false);
  });

  it("does not flag old properties as new construction", () => {
    const result = detectPropertyContext("100 Old St", 1960);
    expect(result.isNewConstruction).toBe(false);
  });

  it("handles null yearBuilt", () => {
    const result = detectPropertyContext("100 Main St", null);
    expect(result.isNewConstruction).toBe(false);
  });

  it("combines unit detection with new construction", () => {
    const currentYear = new Date().getFullYear();
    const result = detectPropertyContext("100 Main St Unit 5", currentYear - 1);
    expect(result.isUnit).toBe(true);
    expect(result.isNewConstruction).toBe(true);
    expect(result.baseAddress).toBe("100 MAIN ST");
  });
});
