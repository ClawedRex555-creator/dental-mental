import {
  parseSessionTokenParts,
  resolveAuthSecret,
  timingSafeEqualString,
  validateSessionTokenPayload,
  type SessionTokenPayload,
} from "./auth-session-token";
import { hmacSha256Base64Url } from "./auth-session-crypto";

/** Edge-safe session verify (proxy) — HMAC-SHA256 over JSON body string */
export async function verifySessionTokenEdge(
  token: string | null | undefined
): Promise<SessionTokenPayload | null> {
  const parts = parseSessionTokenParts(token);
  if (!parts) return null;

  let secret: string;
  try {
    secret = resolveAuthSecret();
  } catch {
    return null;
  }

  const expected = await hmacSha256Base64Url(secret, parts.body);
  if (!timingSafeEqualString(parts.sig, expected)) return null;

  try {
    const parsed = JSON.parse(parts.body) as unknown;
    return validateSessionTokenPayload(parsed);
  } catch {
    return null;
  }
}
