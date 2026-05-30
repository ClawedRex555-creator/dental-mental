import type { UserRole } from "@/lib/types";

export const AUTH_COOKIE = "dc_session";

export interface MiddlewareSessionPayload {
  userId: string;
  staffId?: string;
  role: UserRole;
  name: string;
  email: string;
  clinicId?: string;
  clinicSlug?: string;
  exp: number;
}

function base64UrlToString(value: string): string {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/** Edge-safe session read for middleware (no Node crypto import). */
export function readSessionFromCookie(
  token: string | undefined | null
): MiddlewareSessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  try {
    const parsed = JSON.parse(base64UrlToString(token.slice(0, dot))) as MiddlewareSessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.userId || !parsed.role || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
