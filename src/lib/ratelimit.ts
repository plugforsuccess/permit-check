import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, number[]>({ max: 500 });

/**
 * Simple in-memory rate limiter using LRU cache.
 * Returns true if the request is allowed, false if rate limited.
 *
 * For production, replace with @upstash/ratelimit + @upstash/redis
 * for distributed rate limiting across multiple instances.
 */
export function rateLimit(
  identifier: string,
  limit = 5,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const timestamps = (cache.get(identifier) ?? []).filter(
    (t) => now - t < windowMs
  );
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  cache.set(identifier, timestamps);
  return true;
}
