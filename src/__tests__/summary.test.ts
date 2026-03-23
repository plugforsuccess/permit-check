import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for Claude API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock process.env
vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

// Mock the estated module
vi.mock("../lib/estated", () => ({
  formatPropertyContext: (p: Record<string, unknown>) =>
    p.yearBuilt ? `Year built: ${p.yearBuilt}` : "Property data unavailable",
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

  it("accepts optional Estated property data", async () => {
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
      }
    );

    expect(result.riskLevel).toBe("high");
    expect(result.sellerQuestions).toHaveLength(1);
  });
});
