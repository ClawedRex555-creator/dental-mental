import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export function hashOtp(code: string, requestId: string): string {
  const normalized = code.replace(/\D/g, "");
  return createHash("sha256")
    .update(`${requestId}:${normalized}:${otpPepper()}`)
    .digest("hex");
}

function otpPepper(): string {
  return process.env.AUTH_SECRET?.trim() ?? "document-sign-otp";
}

export function verifyOtp(code: string, requestId: string, otpHash: string | null): boolean {
  if (!otpHash || !code.trim()) return false;
  const expected = Buffer.from(otpHash, "hex");
  const actual = Buffer.from(hashOtp(code, requestId), "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
