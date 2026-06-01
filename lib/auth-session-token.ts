import type { UserRole } from "./types";

export const AUTH_COOKIE = "dc_session";

export const DEV_FALLBACK_SECRET = "dentalcloud-mis-dev-secret-change-in-production";

export interface SessionTokenPayload {
  userId: string;
  staffId?: string;
  role: UserRole;
  name: string;
  email: string;
  clinicId?: string;
  clinicSlug?: string;
  isSuperAdmin?: boolean;
  exp: number;
}

export function resolveAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return DEV_FALLBACK_SECRET;
}

export function base64UrlToString(value: string): string {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

export function stringToBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function parseSessionTokenParts(
  token: string | null | undefined
): { bodyB64: string; sig: string; body: string } | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const bodyB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!bodyB64 || !sig) return null;
  try {
    const body = base64UrlToString(bodyB64);
    return { bodyB64, sig, body };
  } catch {
    return null;
  }
}

export function validateSessionTokenPayload(
  parsed: unknown
): SessionTokenPayload | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as SessionTokenPayload;
  if (!p.exp || p.exp < Date.now()) return null;
  if (!p.userId || !p.name) return null;
  if (!p.isSuperAdmin && !p.role) return null;
  return p;
}

/** Constant-time compare for equal-length base64url strings */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
