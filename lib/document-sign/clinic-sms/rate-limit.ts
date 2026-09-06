/**
 * In-memory rate limit for pairing create / pair attempts.
 * Keys are opaque (clinicId or IP hash) — never log full tokens.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function __resetSignSenderRateLimitForTests(): void {
  buckets.clear();
}

export function checkSignSenderRateLimit(
  key: string,
  maxAttempts: number,
  now = Date.now()
): { allowed: boolean; retryAfterSec?: number } {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) return { allowed: true };
  if (b.count < maxAttempts) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

export function recordSignSenderRateLimit(
  key: string,
  windowMs: number,
  now = Date.now()
): void {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
}
