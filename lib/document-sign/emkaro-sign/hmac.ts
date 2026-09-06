import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 hex по сырому телу (webhook + delivery-destination). */
export function verifyEmkaroSignHmac(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
