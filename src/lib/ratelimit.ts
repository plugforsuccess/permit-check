import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { validateEnv } from "@/lib/env";

// Lazy singleton — only instantiated on first call
let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    validateEnv();
    _ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
    });
  }
  return _ratelimit;
}

export async function rateLimit(identifier: string): Promise<boolean> {
  const { success } = await getRatelimit().limit(identifier);
  if (!success) {
    // Structured logging for rate limit events — helps detect abuse patterns
    console.warn(
      JSON.stringify({
        level: "WARN",
        msg: "Rate limit exceeded",
        identifier: identifier.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, "[REDACTED_IP]"),
        timestamp: new Date().toISOString(),
      })
    );
  }
  return success;
}
