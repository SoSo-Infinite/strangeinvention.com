import { createHash } from "node:crypto";

export type LimitDecision = { ok: boolean; justLimited: boolean };

/**
 * In-memory window limiter. Light protection for one function instance.
 * Keys stay in memory only and must never be written to logs or Blob.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, { n: number; reset: number }>();

  return {
    allow(key: string, now: number): LimitDecision {
      if (buckets.size > 4000) {
        for (const [k, bucket] of buckets) {
          if (now >= bucket.reset) buckets.delete(k);
        }
      }
      const current = buckets.get(key);
      if (!current || now >= current.reset) {
        buckets.set(key, { n: 1, reset: now + windowMs });
        return { ok: true, justLimited: false };
      }
      current.n += 1;
      if (current.n > max) {
        return { ok: false, justLimited: current.n === max + 1 };
      }
      return { ok: true, justLimited: false };
    },
  };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 80);
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 80);
  return "unknown";
}

/** Stable limiter bucket. The address itself is not the key and is not stored. */
export function limiterKey(req: Request): string {
  return createHash("sha256").update(clientIp(req)).digest("hex");
}
