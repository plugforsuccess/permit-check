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
  return success;
}
