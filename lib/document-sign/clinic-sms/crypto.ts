import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function secureRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Redact secret tokens in URLs for logs. */
export function redactSignUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts[parts.length - 1] = "[redacted]";
      u.pathname = "/" + parts.join("/");
    }
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "[redacted-url]";
  }
}

export function maskPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let national = digits;
  if (national.length === 11 && (national.startsWith("7") || national.startsWith("8"))) {
    national = national.slice(1);
  }
  if (national.length !== 10) return "+7 *** ***-**-****";
  const last4 = national.slice(-4);
  return `+7 *** ***-${last4.slice(0, 2)}-${last4.slice(2, 4)}`;
}

export function shortPatientName(input: {
  lastName?: string;
  firstName?: string;
  middleName?: string;
}): string {
  const last = (input.lastName ?? "").trim();
  const first = (input.firstName ?? "").trim();
  const middle = (input.middleName ?? "").trim();
  const fi = first ? `${first[0]!.toUpperCase()}.` : "";
  const mi = middle ? `${middle[0]!.toUpperCase()}.` : "";
  return [last, fi, mi].filter(Boolean).join(" ") || "Пациент";
}
