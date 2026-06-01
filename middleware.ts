import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  readSessionFromCookie,
  sessionCookieOptions,
} from "@/lib/auth-session-middleware";
import {
  clinicSlugMismatch,
  parseClinicSlugFromHost,
  isPlatformHost,
} from "@/lib/clinic-host";
import { canAccessPath, defaultPathForRole } from "@/lib/rbac";

const PUBLIC_CLINIC_PATHS = ["/login"];
const PLATFORM_PUBLIC_PATHS = ["/", "/platform/login"];

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
    pathname.startsWith("/api/clinic/context") ||
    pathname.startsWith("/api/platform/auth/login") ||
    pathname.startsWith("/api/health")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const clinicSlug = parseClinicSlugFromHost(host);
  const platform = isPlatformHost(host);

  if (isStaticOrNextAsset(pathname)) {
    return NextResponse.next();
  }

  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const session = readSessionFromCookie(request.cookies.get(AUTH_COOKIE)?.value);

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
      return NextResponse.redirect(new URL(defaultPathForRole(session.role), request.url));
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL(defaultPathForRole(session.role), request.url));
    }

    if (!canAccessPath(session.role, pathname)) {
      return NextResponse.redirect(new URL(defaultPathForRole(session.role), request.url));
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
