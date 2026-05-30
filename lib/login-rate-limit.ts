const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

interface AttemptBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, AttemptBucket>();

function prune(key: string, now: number) {
  const b = buckets.get(key);
  if (b && now >= b.resetAt) buckets.delete(key);
}

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  prune(key, now);
  const b = buckets.get(key);
  if (!b) return { allowed: true };
  if (b.count < MAX_ATTEMPTS) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  prune(key, now);
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  b.count += 1;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}

export function loginRateLimitKey(request: Request, login: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${ip}:${login.toLowerCase()}`;
}
