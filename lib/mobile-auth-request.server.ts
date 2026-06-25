import "server-only";

import { verifyMobileAccessToken } from "@/lib/mobile-auth";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function requireMobileSession(request: Request): MobileTokenPayload | null {
  return verifyMobileAccessToken(readBearerToken(request));
}
