import { describe, it, expect } from "vitest";
import { normalizeAddress, validateAddress } from "../lib/address";

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
