import { createHmac, timingSafeEqual } from "crypto";
import {
  AUTH_COOKIE,
  parseSessionTokenParts,
  resolveAuthSecret,
  stringToBase64Url,
  validateSessionTokenPayload,
  type SessionTokenPayload,
} from "@/lib/auth-session-token";

export { AUTH_COOKIE } from "@/lib/auth-session-token";
export type { SessionTokenPayload as SessionPayload } from "@/lib/auth-session-token";
export { sessionCookieOptions } from "@/lib/auth-session-middleware";

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSessionToken(
  payload: Omit<SessionTokenPayload, "exp">,
  maxAgeDays = 7
): string {
  const exp = Date.now() + maxAgeDays * 24 * 60 * 60 * 1000;
  const body = JSON.stringify({ ...payload, exp });
  const bodyB64 = stringToBase64Url(body);
  return `${bodyB64}.${signBody(body, resolveAuthSecret())}`;
}

export function verifySessionToken(
  token: string | undefined | null
): SessionTokenPayload | null {
  const parts = parseSessionTokenParts(token);
  if (!parts) return null;

  let secret: string;
  try {
    secret = resolveAuthSecret();
  } catch {
    return null;
  }

  const expected = signBody(parts.body, secret);
  try {
    const a = Buffer.from(parts.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(parts.body) as unknown;
    return validateSessionTokenPayload(parsed);
  } catch {
    return null;
  }
}

/** Перевыпуск cookie с актуальной ролью / именем / email из учётной записи */
export function createRefreshedSessionToken(
  session: SessionTokenPayload,
  patch: { role?: SessionTokenPayload["role"]; name?: string; email?: string }
): string {
  return createSessionToken({
    userId: session.userId,
    staffId: session.staffId,
    role: patch.role ?? session.role,
    name: patch.name ?? session.name,
    email: patch.email ?? session.email,
    clinicId: session.clinicId,
    clinicSlug: session.clinicSlug,
    isSuperAdmin: session.isSuperAdmin,
  });
}
