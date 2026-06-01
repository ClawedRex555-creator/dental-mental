import { verifySessionTokenEdge } from "@/lib/auth-session-edge";
import type { SessionTokenPayload } from "@/lib/auth-session-token";

export { AUTH_COOKIE } from "@/lib/auth-session-token";

export type MiddlewareSessionPayload = SessionTokenPayload;

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Edge-safe session read for middleware — requires valid HMAC signature */
export async function readSessionFromCookie(
  token: string | undefined | null
): Promise<MiddlewareSessionPayload | null> {
  return verifySessionTokenEdge(token);
}
