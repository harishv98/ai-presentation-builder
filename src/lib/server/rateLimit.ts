const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SWEEP_AT = 5_000;

export const RATE_LIMITS = { perMinute: 40, perDay: 400 };

type Bucket = { recent: number[]; dayStart: number; dayCount: number };

const buckets = new Map<string, Bucket>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function takeToken(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  if (buckets.size >= SWEEP_AT) for (const [k, b] of buckets) if (now - b.dayStart >= DAY_MS) buckets.delete(k);
  const bucket = buckets.get(key) ?? { recent: [], dayStart: now, dayCount: 0 };
  buckets.set(key, bucket);
  if (now - bucket.dayStart >= DAY_MS) {
    bucket.dayStart = now;
    bucket.dayCount = 0;
  }
  bucket.recent = bucket.recent.filter((t) => now - t < MINUTE_MS);

  if (bucket.dayCount >= RATE_LIMITS.perDay) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.dayStart + DAY_MS - now) / 1000) };
  }
  const oldest = bucket.recent[0];
  if (oldest !== undefined && bucket.recent.length >= RATE_LIMITS.perMinute) {
    return { ok: false, retryAfterSec: Math.ceil((oldest + MINUTE_MS - now) / 1000) };
  }
  bucket.recent.push(now);
  bucket.dayCount += 1;
  return { ok: true };
}
