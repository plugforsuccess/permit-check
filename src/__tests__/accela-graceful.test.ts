import { describe, it, expect, vi } from "vitest";

// Mock fetch to simulate Accela being unreachable
vi.stubGlobal(
  "fetch",
  vi.fn().mockRejectedValue(new Error("Network error: ECONNREFUSED"))
);

// Must import after mocking fetch
const { fetchPermits } = await import("../lib/accela");

describe("fetchPermits graceful failure", () => {
  it("returns structured warning instead of throwing when Accela is unreachable", async () => {
    const result = await fetchPermits("123 Peachtree St");

    // Must not throw — should return a result object
    expect(result).toBeDefined();
    expect(result.permits).toEqual([]);
    expect(result.total_count).toBe(0);
    expect(result.source).toBe("accela_scraper");
    expect(result.warning).toBe(
      "Permit data temporarily unavailable. Please try again shortly."
    );
  });

  it("does not return HTTP 500 status — warning is in response body", async () => {
    const result = await fetchPermits("456 Peachtree Rd");

    // The function returns data, not an HTTP response.
    // The API route wraps this in a 200 with the warning field.
    expect(result.warning).toBeTruthy();
    expect(result.permits).toHaveLength(0);
  });
});
