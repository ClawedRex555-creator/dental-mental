import { createHmac } from "crypto";
import {
  parseSessionTokenParts,
  stringToBase64Url,
  timingSafeEqualString,
} from "./auth-session-token";
import {
  resolveMobileAuthSecret,
  validateMobileTokenPayload,
  type MobileTokenPayload,
} from "./mobile-auth-token";

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createMobileAccessToken(
  payload: Omit<MobileTokenPayload, "exp">,
  maxAgeDays = 30
): string {
  const exp = Date.now() + maxAgeDays * 24 * 60 * 60 * 1000;
  const body = JSON.stringify({ ...payload, exp });
  const bodyB64 = stringToBase64Url(body);
  return `${bodyB64}.${signBody(body, resolveMobileAuthSecret())}`;
}

export function verifyMobileAccessToken(
  token: string | undefined | null
): MobileTokenPayload | null {
  const parts = parseSessionTokenParts(token);
  if (!parts) return null;

  let secret: string;
  try {
    secret = resolveMobileAuthSecret();
  } catch {
    return null;
  }

  const expected = signBody(parts.body, secret);
  if (!timingSafeEqualString(parts.sig, expected)) return null;

  try {
    return validateMobileTokenPayload(JSON.parse(parts.body) as unknown);
  } catch {
    return null;
  }
}
