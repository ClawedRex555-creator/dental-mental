import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface DocumentSignTokenPayload {
  requestId: string;
  clinicId: string;
  patientId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET required for document sign tokens");
  return s;
}

export function hashDocumentSignToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signDocumentSignToken(
  payload: Omit<DocumentSignTokenPayload, "exp">
): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = JSON.stringify({ ...payload, exp });
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

export function verifyDocumentSignToken(token: string): DocumentSignTokenPayload | null {
  const [bodyB64, sig] = token.split(".");
  if (!bodyB64 || !sig) return null;
  try {
    const body = Buffer.from(bodyB64, "base64url").toString("utf8");
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(body) as DocumentSignTokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.requestId || !payload.clinicId || !payload.patientId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildDocumentSignPageUrl(baseUrl: string, token: string): string {
  const url = new URL("/sign", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("t", token);
  return url.toString();
}

/** Одноразовый OTP для SMS (не путать с подписанной ссылкой). */
export function generateOtpCode(): string {
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return String(n).padStart(6, "0");
}
