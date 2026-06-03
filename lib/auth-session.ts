import { createHmac } from "crypto";
import {
  AUTH_COOKIE,
  parseSessionTokenParts,
  resolveAuthSecret,
  stringToBase64Url,
  timingSafeEqualString,
  validateSessionTokenPayload,
  type SessionTokenPayload,
} from "./auth-session-token.ts";

export { AUTH_COOKIE } from "./auth-session-token.ts";
export type { SessionTokenPayload as SessionPayload } from "./auth-session-token.ts";
export { sessionCookieOptions } from "./auth-session-middleware.ts";
export { readSessionFromCookie } from "./auth-session-middleware.ts";

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Подписанная сессия (Node crypto — как до security review) */
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
  if (!timingSafeEqualString(parts.sig, expected)) return null;

  try {
    return validateSessionTokenPayload(JSON.parse(parts.body) as unknown);
  } catch {
    return null;
  }
}

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
