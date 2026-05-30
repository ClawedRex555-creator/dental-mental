import { createHmac, timingSafeEqual } from "crypto";
import type { UserRole } from "@/lib/types";

export const AUTH_COOKIE = "dc_session";

const DEV_FALLBACK_SECRET = "dentalcloud-mis-dev-secret-change-in-production";

function resolveSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return DEV_FALLBACK_SECRET;
}

export interface SessionPayload {
  userId: string;
  staffId?: string;
  role: UserRole;
  name: string;
  email: string;
  clinicId?: string;
  clinicSlug?: string;
  exp: number;
}

function sign(body: string): string {
  return createHmac("sha256", resolveSecret()).update(body).digest("base64url");
}

export function createSessionToken(
  payload: Omit<SessionPayload, "exp">,
  maxAgeDays = 7
): string {
  const exp = Date.now() + maxAgeDays * 24 * 60 * 60 * 1000;
  const body = JSON.stringify({ ...payload, exp });
  const bodyB64 = Buffer.from(body, "utf8").toString("base64url");
  return `${bodyB64}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const bodyB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let body: string;
  try {
    body = Buffer.from(bodyB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(body) as SessionPayload;
  } catch {
    return null;
  }
  if (!parsed.exp || parsed.exp < Date.now()) return null;
  if (!parsed.userId || !parsed.role || !parsed.name) return null;
  return parsed;
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
