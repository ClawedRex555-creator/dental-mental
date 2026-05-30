import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  readSessionFromCookie,
  sessionCookieOptions,
} from "@/lib/auth-session-middleware";
import { parseClinicSlugFromHost, isPlatformHost } from "@/lib/clinic-host";
import { canAccessPath, defaultPathForRole } from "@/lib/rbac";
const PUBLIC_CLINIC_PATHS = ["/login"];

function isPublicClinicPath(pathname: string): boolean {
  return PUBLIC_CLINIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
    pathname.startsWith("/api/clinic/context") ||
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
    if (pathname === "/") {
      return NextResponse.next();
    }
    if (session && pathname === "/login") {
      return NextResponse.redirect(
        new URL(defaultPathForRole(session.role), request.url)
      );
    }
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (!platform && clinicSlug) {
    if (
      session?.clinicSlug &&
      session.clinicSlug !== clinicSlug
    ) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
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
