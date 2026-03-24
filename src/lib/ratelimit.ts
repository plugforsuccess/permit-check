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

/**
 * Extract client IP from x-forwarded-for. Falls back to "unknown" which
 * means all unidentifiable callers share a single rate-limit bucket —
 * this is intentionally restrictive so IP-less requests don't bypass limits.
 *
 * On Vercel/Cloudflare, x-forwarded-for is always present, so this fallback
 * only fires for direct or misconfigured access.
 */
export function extractClientIp(request: { headers: { get(name: string): string | null } }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// Separate rate limiter for status polling — more permissive (60 req/60s)
let _statusRatelimit: Ratelimit | null = null;

function getStatusRatelimit(): Ratelimit {
  if (!_statusRatelimit) {
    validateEnv();
    _statusRatelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      analytics: true,
    });
  }
  return _statusRatelimit;
}

export async function rateLimitStatus(identifier: string): Promise<boolean> {
  const { success } = await getStatusRatelimit().limit(identifier);
  return success;
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
