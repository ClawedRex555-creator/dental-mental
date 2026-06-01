import {
  parseSessionTokenParts,
  resolveAuthSecret,
  timingSafeEqualString,
  validateSessionTokenPayload,
  type SessionTokenPayload,
} from "./auth-session-token.ts";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

/** Edge-safe session verify (middleware) — HMAC-SHA256 over JSON body string */
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
