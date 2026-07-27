import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findAccountByLogin, verifyAccountPassword } from "@/lib/auth-accounts-server";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth-session";
import { bumpAuthSessionVersionByUserIdDb, findClinicBySlug } from "@/lib/clinic-db.server";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { isDatabaseEnabled } from "@/lib/db";
import { loginRedirectForRole } from "@/lib/login-redirect";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { buildSessionCookieOptions } from "@/lib/session-cookie.server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { verifySameOrigin } from "@/lib/csrf-origin";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  let body: {
    login?: string;
    password?: string;
    redirect?: boolean;
    redirectTo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!login || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const host = request.headers.get("host");
  const clinicSlug = parseClinicSlugFromHost(host);

  let clinicId: string | undefined;
  let clinicSlugForSession = clinicSlug ?? undefined;

  if (isDatabaseEnabled()) {
    if (!clinicSlug) {
      return NextResponse.json(
        { error: "Вход только через поддомен клиники (например ulybka.ваш-домен.ru)" },
        { status: 400 }
      );
    }
    const clinic = await findClinicBySlug(clinicSlug);
    if (!clinic) {
      return NextResponse.json({ error: "Клиника не найдена" }, { status: 404 });
    }
    clinicId = clinic.id;
    clinicSlugForSession = clinic.slug;
  }

  const rateKey = loginRateLimitKey(`clinic:${clinicSlug ?? "local"}`, login);
  const rate = checkLoginRateLimit(rateKey);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }

  const account = await findAccountByLogin(login, clinicId);
  if (!account || !verifyAccountPassword(account, password)) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  clearLoginAttempts(rateKey);

  // Audit: фиксируем успешный вход на стороне сервера.
  // Это надёжнее, чем клиентский вызов, и срабатывает даже если UI не успел отрендериться.
  try {
    await writeAuditLog(
      auditFromRequest(request, {
        clinicId,
        userId: account.id,
        userName: account.name,
        userRole: account.role,
        action: "login",
        resourceType: "auth",
        resourceId: account.id,
        metadata: {
          login: account.login,
          role: account.role,
          clinicSlug: clinicSlugForSession,
        },
      })
    );
  } catch {
    // журнал не должен блокировать вход
  }

  let sessionVersion: number | undefined;
  if (isDatabaseEnabled() && clinicId) {
    sessionVersion =
      (await bumpAuthSessionVersionByUserIdDb(clinicId, account.id)) ?? undefined;
  }

  const token = createSessionToken({
    userId: account.id,
    staffId: account.staffId,
    sessionVersion,
    role: account.role,
    name: account.name,
    email: account.login,
    clinicId,
    clinicSlug: clinicSlugForSession,
  });

  const cookieOpts = buildSessionCookieOptions(SESSION_MAX_AGE_SEC, request);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, cookieOpts);

  const redirectTo = safeRedirectPath(
    body.redirectTo ?? loginRedirectForRole(account.role)
  );

  const userPayload = {
    id: account.id,
    name: account.name,
    email: account.login,
    role: account.role,
    staffId: account.staffId,
    status: "active" as const,
    clinicId,
    clinicSlug: clinicSlugForSession,
  };

  if (body.redirect === true) {
    const res = NextResponse.redirect(new URL(redirectTo, request.url), 303);
    res.cookies.set(AUTH_COOKIE, token, cookieOpts);
    return res;
  }

  const res = NextResponse.json({
    user: userPayload,
    redirectTo,
  });
  res.cookies.set(AUTH_COOKIE, token, cookieOpts);
  return res;
}
