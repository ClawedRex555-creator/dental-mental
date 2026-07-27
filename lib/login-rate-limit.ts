/**
 * In-memory rate limit по email (scope + login).
 * Действует только в рамках одного процесса Node.js.
 * При нескольких репликах app или перезапуске контейнера счётчики не общие;
 * для кластера нужен внешний store (Redis и т.п.). См. docs/COMPLIANCE-152FZ.md.
 */
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_MAX_ATTEMPTS = 5;

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

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  prune(key, now);
  const b = buckets.get(key);
  if (!b) return { allowed: true };
  if (b.count < LOGIN_RATE_MAX_ATTEMPTS) return { allowed: true };
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
    buckets.set(key, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return;
  }
  b.count += 1;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}

/**
 * Ключ брутфорс-лимита: scope + нормализованный email (без IP).
 * Примеры: clinic:ulybka:user@x.ru, platform:admin@x.ru, mobile:slug:user@x.ru
 */
export function loginRateLimitKey(scope: string, login: string): string {
  return `${scope}:${login.trim().toLowerCase()}`;
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
