import { describe, it, expect } from "vitest";
import { rateLimit } from "../lib/ratelimit";

describe("rateLimit", () => {
  it("allows up to 5 requests within 60s window", () => {
    const id = "test-ip-" + Date.now();
    expect(rateLimit(id, 5, 60_000)).toBe(true);  // 1
    expect(rateLimit(id, 5, 60_000)).toBe(true);  // 2
    expect(rateLimit(id, 5, 60_000)).toBe(true);  // 3
    expect(rateLimit(id, 5, 60_000)).toBe(true);  // 4
    expect(rateLimit(id, 5, 60_000)).toBe(true);  // 5
  });

  it("blocks the 6th request within 60s window", () => {
    const id = "test-ip-block-" + Date.now();
    for (let i = 0; i < 5; i++) {
      rateLimit(id, 5, 60_000);
    }
    // 6th request must return false (429)
    expect(rateLimit(id, 5, 60_000)).toBe(false);
  });

  it("allows requests from different identifiers independently", () => {
    const id1 = "ip-a-" + Date.now();
    const id2 = "ip-b-" + Date.now();
    for (let i = 0; i < 5; i++) {
      rateLimit(id1, 5, 60_000);
    }
    // id1 exhausted, id2 should still work
    expect(rateLimit(id1, 5, 60_000)).toBe(false);
    expect(rateLimit(id2, 5, 60_000)).toBe(true);
  });

  it("allows requests again after window expires", () => {
    const id = "test-ip-expire-" + Date.now();
    // Use a very short window (10ms)
    for (let i = 0; i < 5; i++) {
      rateLimit(id, 5, 10);
    }
    expect(rateLimit(id, 5, 10)).toBe(false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rateLimit(id, 5, 10)).toBe(true);
        resolve();
      }, 20);
    });
  });
});
