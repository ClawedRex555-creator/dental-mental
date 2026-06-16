import { createHash, timingSafeEqual } from "crypto";

const HEADER_NAME = "x-tls-ask-secret";

/** Constant-time compare (hash both sides to avoid length leaks). */
export function secureCompareSecret(provided: string, expected: string): boolean {
  const ha = createHash("sha256").update(provided).digest();
  const hb = createHash("sha256").update(expected).digest();
  return timingSafeEqual(ha, hb);
}

export function resolveTlsAskSecret(): string | undefined {
  return process.env.TLS_ASK_SECRET?.trim() || undefined;
}

export function verifyTlsAskSecret(request: Request): boolean {
  const expected = resolveTlsAskSecret();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TLS_ASK_SECRET is required in production");
    }
    return true;
  }

  const provided =
    request.headers.get(HEADER_NAME) ??
    request.headers.get("X-TLS-Ask-Secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!provided) return false;
  return secureCompareSecret(provided, expected);
}
