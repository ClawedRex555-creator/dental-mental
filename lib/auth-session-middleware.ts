import type { NextRequest } from "next/server";
import {
  parseSessionTokenParts,
  validateSessionTokenPayload,
  type SessionTokenPayload,
} from "./auth-session-token.ts";

export { AUTH_COOKIE } from "./auth-session-token.ts";

export type MiddlewareSessionPayload = SessionTokenPayload;

export function sessionCookieOptions(
  maxAgeSeconds: number,
  request?: Pick<NextRequest, "headers"> | Pick<Request, "headers">
) {
  const forwarded = request?.headers.get("x-forwarded-proto");
  const secure =
    forwarded === "https" ||
    (forwarded !== "http" && process.env.NODE_ENV === "production");

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Структурная проверка cookie (без HMAC) — только для legacy helpers.
 * Proxy и API routes должны использовать verifySessionTokenEdge / verifySessionToken.
 */
export function readSessionFromCookie(
  token: string | undefined | null
): MiddlewareSessionPayload | null {
  const parts = parseSessionTokenParts(token);
  if (!parts) return null;
  try {
    const parsed = JSON.parse(parts.body) as unknown;
    return validateSessionTokenPayload(parsed);
  } catch {
    return null;
  }
}
