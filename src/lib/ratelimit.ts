import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

function makeRedis(): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// Lazy singleton — only instantiated on first call
let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: makeRedis(),
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
    _statusRatelimit = new Ratelimit({
      redis: makeRedis(),
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
    log.warn("ratelimit: exceeded", {
      step_name: "ratelimit",
      event_type: "ratelimit_exceeded",
      // Redact IPs from rate-limit identifiers; helps detect abuse patterns
      // without leaking address-bearing identifiers into logs.
      identifier: identifier.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, "[REDACTED_IP]"),
    });
  }
  return success;
}
