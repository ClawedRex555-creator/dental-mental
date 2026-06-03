import { AUTH_COOKIE } from "@/lib/auth-session-token";

/** Прочитать dc_session из заголовка Cookie (fallback для Route Handlers) */
export function readAuthCookieFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${AUTH_COOKIE}=`)) {
      const raw = trimmed.slice(AUTH_COOKIE.length + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}
