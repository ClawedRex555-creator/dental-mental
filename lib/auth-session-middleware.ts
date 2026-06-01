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
 * Middleware: структура + срок действия (как до security review).
 * HMAC проверяется на API routes через verifySessionToken() — там Node/runtime AUTH_SECRET.
 *
 * Edge HMAC здесь ломал вход: бандл middleware не всегда видит AUTH_SECRET,
 * session=null → 401 на /api/auth/me и редирект на /login при живой cookie.
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
