/**
 * Rate limit по scope+login (+ опционально IP).
 * Сначала Postgres (`rate_limit_buckets`), иначе in-memory fallback на процесс.
 * См. docs/COMPLIANCE-152FZ.md.
 */
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_MAX_ATTEMPTS = 5;
export const LANDING_RATE_WINDOW_MS = 60 * 1000;
export const LANDING_RATE_MAX_ATTEMPTS = 10;

interface AttemptBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, AttemptBucket>();

/** Только для тестов. */
export function __resetLoginRateLimitForTests(): void {
  buckets.clear();
}

function prune(key: string, now: number) {
  const b = buckets.get(key);
  if (b && now >= b.resetAt) buckets.delete(key);
}

export function checkLoginRateLimit(
  key: string,
  maxAttempts = LOGIN_RATE_MAX_ATTEMPTS
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  prune(key, now);
  const b = buckets.get(key);
  if (!b) return { allowed: true };
  if (b.count < maxAttempts) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

export function recordLoginFailure(key: string, windowMs = LOGIN_RATE_WINDOW_MS): void {
  const now = Date.now();
  prune(key, now);
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}

/**
 * Ключ брутфорс-лимита: scope + нормализованный email (+ IP если есть).
 * Примеры: clinic:ulybka:user@x.ru, platform:admin@x.ru, mobile:slug:user@x.ru
 */
export function loginRateLimitKey(scope: string, login: string, ip?: string | null): string {
  const base = `${scope}:${login.trim().toLowerCase()}`;
  const normalizedIp = ip?.trim();
  return normalizedIp ? `${base}:ip:${normalizedIp}` : base;
}

export function clientIpFromRequest(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 128) : null;
}

/** Async: Postgres bucket, иначе memory. */
export async function checkLoginRateLimitAsync(
  key: string,
  maxAttempts = LOGIN_RATE_MAX_ATTEMPTS
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  try {
    const { checkRateLimitDb } = await import("@/lib/rate-limit.server");
    const db = await checkRateLimitDb(key, maxAttempts);
    if (db) return db;
  } catch {
    /* table missing / DB down → memory */
  }
  return checkLoginRateLimit(key, maxAttempts);
}

export async function recordLoginFailureAsync(
  key: string,
  windowMs = LOGIN_RATE_WINDOW_MS
): Promise<void> {
  recordLoginFailure(key, windowMs);
  try {
    const { recordRateLimitFailureDb } = await import("@/lib/rate-limit.server");
    await recordRateLimitFailureDb(key, windowMs);
  } catch {
    /* ignore */
  }
}

export async function clearLoginAttemptsAsync(key: string): Promise<void> {
  clearLoginAttempts(key);
  try {
    const { clearRateLimitDb } = await import("@/lib/rate-limit.server");
    await clearRateLimitDb(key);
  } catch {
    /* ignore */
  }
}

/** 429 + Retry-After (стандартный Response — совместим с Next.js route handlers). */
export function loginRateLimitResponse(retryAfterSec: number): Response {
  const sec = Math.max(1, Math.floor(retryAfterSec));
  return Response.json(
    { error: `Слишком много попыток. Повторите через ${sec} с.` },
    {
      status: 429,
      headers: { "Retry-After": String(sec) },
    }
  );
}
