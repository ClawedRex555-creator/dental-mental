import type { NextRequest } from "next/server";

/** Надёжный флаг Secure за TLS-терминацией (Caddy) */
export function isSecureSessionRequest(
  request: Pick<Request, "headers"> | Pick<NextRequest, "headers">
): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return false;
  }

  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded?.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }

  const root = (process.env.APP_ROOT_DOMAIN ?? "emkaro.ru").toLowerCase();
  if (host === root || host.endsWith(`.${root}`)) {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

export function buildSessionCookieOptions(
  maxAgeSeconds: number,
  request: Pick<Request, "headers"> | Pick<NextRequest, "headers">
) {
  return {
    httpOnly: true,
    secure: isSecureSessionRequest(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
