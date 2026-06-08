import { resolveAuthSecret } from "./auth-session-token.ts";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** HMAC-SHA256 (base64url) — одинаково в Node и Edge */
export async function hmacSha256Base64Url(
  secret: string,
  message: string
): Promise<string> {
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

export async function signSessionBody(body: string): Promise<string> {
  return hmacSha256Base64Url(resolveAuthSecret(), body);
}
