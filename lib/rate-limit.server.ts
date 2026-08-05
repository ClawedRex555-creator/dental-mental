import "server-only";

import { withDb } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

/**
 * Postgres rate-limit bucket. Returns null if DB unavailable (caller uses memory fallback).
 */
export async function checkRateLimitDb(
  key: string,
  maxAttempts: number
): Promise<RateLimitResult | null> {
  const now = new Date();
  const result = await withDb(async (client) => {
    const res = await client.query<{ attempt_count: number; reset_at: Date }>(
      `SELECT attempt_count, reset_at FROM rate_limit_buckets WHERE bucket_key = $1`,
      [key]
    );
    const row = res.rows[0];
    if (!row) return { allowed: true as const };
    if (row.reset_at.getTime() <= now.getTime()) {
      await client.query(`DELETE FROM rate_limit_buckets WHERE bucket_key = $1`, [key]);
      return { allowed: true as const };
    }
    if (row.attempt_count < maxAttempts) return { allowed: true as const };
    return {
      allowed: false as const,
      retryAfterSec: Math.max(1, Math.ceil((row.reset_at.getTime() - now.getTime()) / 1000)),
    };
  });
  return result;
}

export async function recordRateLimitFailureDb(
  key: string,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const ok = await withDb(async (client) => {
    await client.query(
      `INSERT INTO rate_limit_buckets (bucket_key, attempt_count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (bucket_key) DO UPDATE
       SET attempt_count = CASE
             WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
             ELSE rate_limit_buckets.attempt_count + 1
           END,
           reset_at = CASE
             WHEN rate_limit_buckets.reset_at <= NOW() THEN EXCLUDED.reset_at
             ELSE rate_limit_buckets.reset_at
           END`,
      [key, resetAt.toISOString()]
    );
    return true;
  });
  return Boolean(ok);
}

export async function clearRateLimitDb(key: string): Promise<boolean> {
  const ok = await withDb(async (client) => {
    await client.query(`DELETE FROM rate_limit_buckets WHERE bucket_key = $1`, [key]);
    return true;
  });
  return Boolean(ok);
}
