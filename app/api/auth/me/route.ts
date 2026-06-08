import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { updateAuthAccountByUserId } from "@/lib/auth-accounts-server";
import { readAuthCookieFromHeader } from "@/lib/auth-cookie";
import {
  AUTH_COOKIE,
  createRefreshedSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth-session";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { buildSessionCookieOptions } from "@/lib/session-cookie.server";
import { clinicSlugMismatch, parseClinicSlugFromHost } from "@/lib/clinic-host";
import { resolveAuthUserFromSession } from "@/lib/resolve-auth-user.server";
import { isDatabaseEnabled } from "@/lib/db";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function readToken(request: Request, cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return (
    cookieStore.get(AUTH_COOKIE)?.value ??
    readAuthCookieFromHeader(request.headers.get("cookie"))
  );
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = readToken(request, cookieStore);
  const session = verifySessionToken(token);

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

  const cookieOpts = buildSessionCookieOptions(SESSION_MAX_AGE_SEC, request);

  try {
    const { user, sessionPatch, found } = await resolveAuthUserFromSession(session);

    // Если учётка удалена (уволен), не пускаем даже со старой cookie.
    if (isDatabaseEnabled() && session.clinicId && !found) {
      const res = NextResponse.json(
        { error: "Учётная запись отключена. Войдите снова." },
        { status: 401 }
      );
      res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
      return res;
    }

    const res = NextResponse.json({
      user: {
        ...user,
        clinicId: session.clinicId,
        clinicSlug: session.clinicSlug,
      },
    });

    if (sessionPatch) {
      const refreshed = createRefreshedSessionToken(session, sessionPatch);
      cookieStore.set(AUTH_COOKIE, refreshed, cookieOpts);
      res.cookies.set(AUTH_COOKIE, refreshed, cookieOpts);
    }

    return res;
  } catch (err) {
    console.error("[auth/me] resolve user failed", err);
    return NextResponse.json(
      { error: "Не удалось проверить учётную запись. Повторите позже." },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = readToken(request, cookieStore);
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.isSuperAdmin) {
    return NextResponse.json({ error: "Используйте /platform/admin" }, { status: 403 });
  }

  const host = request.headers.get("host");
  if (clinicSlugMismatch(session.clinicSlug, host)) {
    return NextResponse.json({ error: "Сессия другой клиники" }, { status: 403 });
  }

  let body: {
    name?: string;
    login?: string;
    password?: string;
    currentPassword?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase();
  const name = body.name?.trim();
  if (!name && !login && !body.password?.trim()) {
    return NextResponse.json({ error: "Нечего сохранять" }, { status: 400 });
  }

  const clinicId = await resolveClinicIdForSession(session, host);
  const current = await resolveAuthUserFromSession(session);

  try {
    const account = await updateAuthAccountByUserId({
      userId: session.userId,
      clinicId: clinicId ?? undefined,
      login: login || current.user.email,
      name: name || current.user.name,
      password: body.password,
      currentPassword: body.currentPassword,
    });

    const user = {
      id: account.id,
      name: account.name,
      email: account.login,
      role: account.role,
      staffId: account.staffId ?? session.staffId,
      status: "active" as const,
      clinicId: session.clinicId,
      clinicSlug: session.clinicSlug,
    };

    const cookieOpts = buildSessionCookieOptions(SESSION_MAX_AGE_SEC, request);
    const refreshed = createRefreshedSessionToken(session, {
      name: account.name,
      email: account.login,
      role: account.role,
    });
    cookieStore.set(AUTH_COOKIE, refreshed, cookieOpts);

    const res = NextResponse.json({ user });
    res.cookies.set(AUTH_COOKIE, refreshed, cookieOpts);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось обновить профиль";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
