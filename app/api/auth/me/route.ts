import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAuthCookieFromHeader } from "@/lib/auth-cookie";
import {
  AUTH_COOKIE,
  createRefreshedSessionToken,
  verifySessionToken,
} from "@/lib/auth-session";
import { buildSessionCookieOptions } from "@/lib/session-cookie.server";
import { clinicSlugMismatch, parseClinicSlugFromHost } from "@/lib/clinic-host";
import { resolveAuthUserFromSession } from "@/lib/resolve-auth-user.server";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(AUTH_COOKIE)?.value ??
    readAuthCookieFromHeader(request.headers.get("cookie"));

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = request.headers.get("host");

  if (session.isSuperAdmin) {
    if (parseClinicSlugFromHost(host)) {
      return NextResponse.json({ error: "Сессия платформы на поддомене клиники" }, { status: 403 });
    }
    return NextResponse.json({ error: "Используйте /platform/admin" }, { status: 403 });
  }

  if (clinicSlugMismatch(session.clinicSlug, host)) {
    return NextResponse.json({ error: "Сессия другой клиники" }, { status: 403 });
  }

  try {
    const { user, sessionPatch } = await resolveAuthUserFromSession(session);

    const res = NextResponse.json({
      user: {
        ...user,
        clinicId: session.clinicId,
        clinicSlug: session.clinicSlug,
      },
    });

    if (sessionPatch) {
      const refreshed = await createRefreshedSessionToken(session, sessionPatch);
      const cookieOpts = buildSessionCookieOptions(SESSION_MAX_AGE_SEC, request);
      const cookieStore = await cookies();
      cookieStore.set(AUTH_COOKIE, refreshed, cookieOpts);
      res.cookies.set(AUTH_COOKIE, refreshed, cookieOpts);
    }

    return res;
  } catch (err) {
    console.error("[auth/me] resolve user failed", err);
    return NextResponse.json({
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        staffId: session.staffId,
        status: "active" as const,
        clinicId: session.clinicId,
        clinicSlug: session.clinicSlug,
      },
    });
  }
}
