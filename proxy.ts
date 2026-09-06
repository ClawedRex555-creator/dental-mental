import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth-session-middleware";
import { verifySessionTokenEdge } from "@/lib/auth-session-edge";
import {
  clinicSlugMismatch,
  parseClinicSlugFromHost,
  isPlatformHost,
} from "@/lib/clinic-host";
import { canAccessPath, defaultPathForRole, isAccountSettingsPath } from "@/lib/rbac";

const PUBLIC_CLINIC_PATHS = ["/login"];
const PLATFORM_PUBLIC_PATHS = [
  "/",
  "/platform/login",
  "/privacy",
  "/personal-data-consent",
  "/cookies",
  "/contacts",
];

function isPublicClinicPath(pathname: string): boolean {
  return PUBLIC_CLINIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPlatformPublicPath(pathname: string): boolean {
  return PLATFORM_PUBLIC_PATHS.some((p) => pathname === p);
}

function isStaticOrNextAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/dental/") ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

function isPublicApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/me") ||
    pathname.startsWith("/api/auth/emkaro-sign/sso") ||
    pathname.startsWith("/api/clinic/context") ||
    pathname.startsWith("/api/landing/connection-requests") ||
    pathname.startsWith("/api/platform/auth/login") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/internal/tls-ask") ||
    pathname.startsWith("/api/notifications/action")
  );
}

/** Внешние колбэки / cron / mobile API — без cookie-сессии, со своей авторизацией в route handler */
function isServiceApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/egisz/webhook") ||
    pathname.startsWith("/api/egisz/process") ||
    pathname.startsWith("/api/notifications/process") ||
    pathname.startsWith("/api/medflex/booking") ||
    pathname.startsWith("/api/medflex/health") ||
    pathname.startsWith("/api/medflex/process") ||
    pathname.startsWith("/api/mobile/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const clinicSlug = parseClinicSlugFromHost(host);
  const platform = isPlatformHost(host);

  if (isStaticOrNextAsset(pathname)) {
    return NextResponse.next();
  }

  if (isPublicApi(pathname) || isServiceApi(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySessionTokenEdge(request.cookies.get(AUTH_COOKIE)?.value);

  if (platform) {
    if (pathname === "/platform/login") {
      if (session?.isSuperAdmin) {
        return NextResponse.redirect(new URL("/platform/admin", request.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/platform/admin") || pathname.startsWith("/api/platform/")) {
      if (!session?.isSuperAdmin) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
        }
        const loginUrl = new URL("/platform/login", request.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }

    if (isPlatformPublicPath(pathname)) {
      return NextResponse.next();
    }

    if (session && pathname === "/login") {
      if (session.isSuperAdmin) {
        return NextResponse.redirect(new URL("/platform/admin", request.url));
      }
      return NextResponse.redirect(
        new URL(defaultPathForRole(session.role), request.url)
      );
    }

    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
      }
      if (isPlatformPublicPath(pathname)) return NextResponse.next();
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (!platform && clinicSlug) {
    if (session?.isSuperAdmin) {
      return NextResponse.redirect(new URL("/platform/admin", request.url));
    }

    if (clinicSlugMismatch(session?.clinicSlug, host)) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0, request));
      return res;
    }

    if (pathname.startsWith("/api/")) {
      if (!session) {
        return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
      }
      return NextResponse.next();
    }

    if (!session) {
      if (isPublicClinicPath(pathname)) return NextResponse.next();
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname === "/login") {
      const from = request.nextUrl.searchParams.get("from");
      // Уже в сессии, но пришли за SSO в Sign — не уводить в МИС-дашборд
      if (
        from &&
        from.startsWith("/api/auth/emkaro-sign/sso") &&
        !from.startsWith("//")
      ) {
        return NextResponse.redirect(new URL(from, request.url));
      }
      return NextResponse.redirect(new URL(defaultPathForRole(session.role), request.url));
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL(defaultPathForRole(session.role), request.url));
    }

    const pathOnly = pathname.split("?")[0];
    if (isAccountSettingsPath(pathOnly)) {
      return NextResponse.next();
    }

    if (!canAccessPath(session.role, pathname)) {
      const fallback = defaultPathForRole(session.role);
      const pathOnlyInner = pathname.split("?")[0];
      const target = fallback === pathOnlyInner ? "/settings" : fallback;
      return NextResponse.redirect(new URL(target, request.url));
    }

    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
