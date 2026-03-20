import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @upstash/redis
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(() => ({})),
  },
}));

let limitCallCount = 0;

// Mock @upstash/ratelimit
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow() {
      return {};
    }
    async limit() {
      limitCallCount++;
      return { success: limitCallCount <= 5 };
    }
  },
}));

// Import after mocks are set up
import { rateLimit } from "../lib/ratelimit";

describe("rateLimit", () => {
  beforeEach(() => {
    limitCallCount = 0;
  });

  it("allows up to 5 requests within 60s window", async () => {
    expect(await rateLimit("test-ip-1")).toBe(true); // 1
    expect(await rateLimit("test-ip-1")).toBe(true); // 2
    expect(await rateLimit("test-ip-1")).toBe(true); // 3
    expect(await rateLimit("test-ip-1")).toBe(true); // 4
    expect(await rateLimit("test-ip-1")).toBe(true); // 5
  });

  it("blocks the 6th request within 60s window", async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit("test-ip-2");
    }
    // 6th request must return false (429)
    expect(await rateLimit("test-ip-2")).toBe(false);
  });

  it("returns a promise", () => {
    const result = rateLimit("test-ip-3");
    expect(result).toBeInstanceOf(Promise);
  });
});
