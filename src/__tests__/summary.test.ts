import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for Claude API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock process.env
vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

import { generatePermitSummary } from "../lib/summary";

describe("generatePermitSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed summary from Claude API", async () => {
    const mockResponse = {
      riskLevel: "low",
      summary: "All permits are in good standing.",
      flags: [],
      positives: ["All permits finaled"],
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
    expect(result.summary).toBe("All permits are in good standing.");
    expect(result.positives).toContain("All permits finaled");
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
    expect(result.summary).toContain("failed");
  });

  it("sends correct headers to Claude API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"riskLevel":"low","summary":"ok","flags":[],"positives":[]}' }],
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
});
