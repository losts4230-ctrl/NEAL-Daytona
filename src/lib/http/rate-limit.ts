import { config } from "@/lib/config";

/**
 * Fixed-window rate limiter, in process memory.
 *
 * Deliberately simple and deliberately limited: it is per-instance, so a
 * horizontally scaled deployment multiplies the effective limit by the instance
 * count, and it resets on cold start. That is an accepted trade-off for launch —
 * it stops a naive script and a stuck submit button, not a distributed attacker.
 * Moving to a shared store (Upstash Redis, Cloudflare Durable Object) is a
 * drop-in replacement behind this same function signature.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  now = Date.now(),
  max = config.rateLimit.max,
  windowSeconds = config.rateLimit.windowSeconds,
): RateLimitResult {
  // Bounded memory: evict expired windows before the map can grow without end.
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  const windowMs = windowSeconds * 1000;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    const window: Window = { count: 1, resetAt: now + windowMs };
    windows.set(key, window);
    return {
      allowed: true,
      remaining: max - 1,
      resetAt: window.resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Test seam. Never called from request handling. */
export function resetRateLimits(): void {
  windows.clear();
}
