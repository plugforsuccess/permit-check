import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for Claude API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock process.env
vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

// Mock the property-data module
vi.mock("../lib/property-data", () => ({
  formatPropertyContext: (p: Record<string, unknown>) =>
    p.yearBuilt ? `Built: ${p.yearBuilt}` : "Property data unavailable",
  yearsSinceLastSale: (p: Record<string, unknown>) => {
    if (!p.lastSaleDate) return null;
    const saleDate = new Date(p.lastSaleDate as string);
    if (isNaN(saleDate.getTime())) return null;
    return Math.floor(
      (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
    );
  },
}));

import { generatePermitSummary } from "../lib/summary";

describe("generatePermitSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed summary from Claude API", async () => {
    const mockResponse = {
      riskLevel: "low",
      verdict: "LOW RISK — All permits finaled.",
      summary: "All permits are in good standing.",
      flags: [],
      positives: ["All permits finaled"],
      sellerQuestions: [],
      listingNotes: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(mockResponse) }],
      }),
    });

    const result = await generatePermitSummary(
      [
        {
          id: "1",
          lookup_id: "l1",
          record_number: "BP-2024-001",
          type: "Building",
          status: "Finaled",
          filed_date: "2024-01-01",
          issued_date: "2024-01-15",
          description: "Kitchen renovation",
          contractor: "ABC Co",
        },
      ],
      "55 TRINITY AVE SW"
    );

    expect(result.riskLevel).toBe("low");
    expect(result.verdict).toBe("LOW RISK — All permits finaled.");
    expect(result.summary).toBe("All permits are in good standing.");
    expect(result.positives).toContain("All permits finaled");
    expect(result.sellerQuestions).toEqual([]);
    expect(result.listingNotes).toEqual([]);
  });

  it("returns fallback on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      generatePermitSummary([], "55 TRINITY AVE SW")
    ).rejects.toThrow("Claude API error: 500");
  });

  it("returns fallback on malformed JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: "not valid json at all" }],
      }),
    });

    const result = await generatePermitSummary([], "55 TRINITY AVE SW");
    expect(result.riskLevel).toBe("medium");
    expect(result.verdict).toContain("failed");
    expect(result.sellerQuestions).toEqual([]);
    expect(result.listingNotes).toEqual([]);
  });

  it("sends correct headers to Claude API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"low","verdict":"ok","summary":"ok","flags":[],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary([], "55 TRINITY AVE SW");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
  });

  it("accepts optional property data with investor detection", async () => {
    const mockResponse = {
      riskLevel: "high",
      verdict: "HIGH RISK — Recent flip with no permits.",
      summary: "Property sold recently with zero renovation permits.",
      flags: ["Zero permits on recent sale"],
      positives: [],
      sellerQuestions: ["Can you provide renovation documentation?"],
      listingNotes: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(mockResponse) }],
      }),
    });

    const result = await generatePermitSummary(
      [],
      "1278 GREENWICH ST SW",
      {
        beds: 3,
        baths: 2,
        sqft: 1500,
        yearBuilt: 1960,
        propertyType: "Single Family",
        lastSalePrice: 250000,
        lastSaleDate: "2025-06-15",
        assessedValue: 200000,
        ownerOccupied: false,
        ownerName: "ATL Properties LLC",
        isInvestorOwned: true,
      }
    );

    expect(result.riskLevel).toBe("high");
    expect(result.sellerQuestions).toHaveLength(1);

    // Verify the prompt includes investor signal
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("ATL Properties LLC");
    expect(promptContent).toContain("non-owner-occupied");
  });

  it("includes unit context when isUnit is true", async () => {
    const mockResponse = {
      riskLevel: "low",
      verdict: "LOW RISK — Zero permits is normal for a condo unit.",
      summary: "This is a condo unit. Development-level permits are expected.",
      flags: [],
      positives: ["Normal for property type"],
      sellerQuestions: [],
      listingNotes: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(mockResponse) }],
      }),
    });

    const result = await generatePermitSummary(
      [],
      "860 PEACHTREE ST NE UNIT 1506",
      null,
      null,
      true,   // isUnit
      false,  // isDevelopmentPermit
    );

    expect(result.riskLevel).toBe("low");

    // Verify the prompt includes unit context
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("UNIT ADDRESS CONTEXT");
    expect(promptContent).toContain("ZERO PERMITS DECISION TREE");
    expect(promptContent).toContain("isUnit = true");
  });

  it("includes new construction context for recent builds", async () => {
    const mockResponse = {
      riskLevel: "low",
      verdict: "LOW RISK — New construction, builder permits filed under developer.",
      summary: "Property built in 2024.",
      flags: [],
      positives: ["New construction"],
      sellerQuestions: [],
      listingNotes: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(mockResponse) }],
      }),
    });

    const result = await generatePermitSummary(
      [],
      "100 NEW BUILD DR",
      {
        beds: 4,
        baths: 3,
        sqft: 2500,
        yearBuilt: 2024,
        propertyType: "Single Family",
        lastSalePrice: 500000,
        lastSaleDate: "2024-11-01",
        assessedValue: 450000,
        ownerOccupied: true,
        ownerName: "John Doe",
        isInvestorOwned: false,
      },
      null,
      false,
      false,
    );

    expect(result.riskLevel).toBe("low");

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("NEW CONSTRUCTION CONTEXT");
    expect(promptContent).toContain("2024");
  });

  it("sends issued_date and sorts permits chronologically", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"low","verdict":"ok","summary":"ok","flags":[],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [
        {
          id: "2",
          lookup_id: "l1",
          record_number: "BP-2024-002",
          type: "Electrical",
          status: "Issued",
          filed_date: "2024-06-01",
          issued_date: "2024-06-15",
          description: "Electrical work",
          contractor: null,
        },
        {
          id: "1",
          lookup_id: "l1",
          record_number: "BP-2024-001",
          type: "Building",
          status: "Finaled",
          filed_date: "2024-01-01",
          issued_date: "2024-01-15",
          description: "Kitchen renovation",
          contractor: null,
        },
      ],
      "55 TRINITY AVE SW"
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;

    // Should include issued date
    expect(promptContent).toContain('"issued"');
    expect(promptContent).toContain("2024-01-15");

    // Should be sorted chronologically (oldest first)
    const firstRecordIdx = promptContent.indexOf("BP-2024-001");
    const secondRecordIdx = promptContent.indexOf("BP-2024-002");
    expect(firstRecordIdx).toBeLessThan(secondRecordIdx);
  });

  it("includes truncation warning when permits_truncated is true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"medium","verdict":"ok","summary":"ok","flags":[],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [],
      "55 TRINITY AVE SW",
      null,
      null,
      false,
      false,
      true, // permitsTruncated
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("INCOMPLETE RECORDS");
    expect(promptContent).toContain("truncated");
  });

  it("includes commercial property context", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"low","verdict":"ok","summary":"ok","flags":[],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [],
      "100 COMMERCIAL ST",
      {
        beds: null,
        baths: null,
        sqft: 5000,
        yearBuilt: 2000,
        propertyType: "Commercial Office",
        lastSalePrice: 1000000,
        lastSaleDate: "2023-01-01",
        assessedValue: 900000,
        ownerOccupied: false,
        ownerName: "Office Corp LLC",
        isInvestorOwned: true,
      },
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("COMMERCIAL/MULTI-FAMILY PROPERTY");
    expect(promptContent).toContain("commercial/investment property");
  });

  it("detects stalled permits in pattern analysis", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"high","verdict":"stalled","summary":"stalled","flags":["stalled"],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [
        {
          id: "1",
          lookup_id: "l1",
          record_number: "BP-2022-001",
          type: "Building",
          status: "In Review",
          filed_date: "2022-01-01",
          issued_date: null,
          description: "Addition",
          contractor: null,
        },
      ],
      "55 TRINITY AVE SW"
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("STALLED PERMITS");
    expect(promptContent).toContain("BP-2022-001");
  });

  it("detects complaints from record types", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"high","verdict":"complaint","summary":"complaint","flags":["complaint"],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [
        {
          id: "1",
          lookup_id: "l1",
          record_number: "CE-2024-001",
          type: "Building Complaint",
          status: "Issued",
          filed_date: "2024-06-01",
          issued_date: null,
          description: "Unpermitted construction",
          contractor: null,
        },
      ],
      "55 TRINITY AVE SW"
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("COMPLAINTS/VIOLATIONS");
    expect(promptContent).toContain("CE-2024-001");
  });

  it("infers flip from listing text when no REAPI data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"high","verdict":"flip","summary":"flip","flags":["flip"],"positives":[],"sellerQuestions":[],"listingNotes":[]}' }],
      }),
    });

    await generatePermitSummary(
      [],
      "55 TRINITY AVE SW",
      null, // no property data
      "Investor special! Recently purchased and fully renovated flip property.",
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const promptContent = callBody.messages[0].content;
    expect(promptContent).toContain("suggests a flip or investor sale");
    expect(promptContent).toContain("elevated scrutiny");
  });
});
