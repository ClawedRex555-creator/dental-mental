import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NotificationActionTokenPayload } from "@/lib/notifications/action-token.types";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET required for notification action tokens");
  return s;
}

export function signNotificationActionToken(
  payload: Omit<NotificationActionTokenPayload, "exp">
): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = JSON.stringify({ ...payload, exp });
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

export function verifyNotificationActionToken(token: string): NotificationActionTokenPayload | null {
  const [bodyB64, sig] = token.split(".");
  if (!bodyB64 || !sig) return null;
  try {
    const body = Buffer.from(bodyB64, "base64url").toString("utf8");
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(body) as NotificationActionTokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.clinicId || !payload.appointmentId || !payload.action) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildConfirmUrl(
  baseUrl: string,
  payload: Omit<NotificationActionTokenPayload, "exp">
): string {
  const token = signNotificationActionToken(payload);
  const url = new URL("/api/notifications/action", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("token", token);
  return url.toString();
}
