import { NextResponse } from "next/server";
import { findAccountByLogin, verifyAccountPassword } from "@/lib/auth-accounts-server";
import {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth-session";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { isDatabaseEnabled } from "@/lib/db";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  loginRateLimitKey,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

export async function POST(request: Request) {
  let body: { login?: string; password?: string };
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

  const rateKey = loginRateLimitKey(request, `${clinicSlug ?? "local"}:${login}`);
  const rate = checkLoginRateLimit(rateKey);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Слишком много попыток. Повторите через ${rate.retryAfterSec} с.` },
      { status: 429 }
    );
  }

  const account = await findAccountByLogin(login, clinicId);
  if (!account || !verifyAccountPassword(account, password)) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  clearLoginAttempts(rateKey);

  const token = createSessionToken({
    userId: account.id,
    staffId: account.staffId,
    role: account.role,
    name: account.name,
    email: account.login,
    clinicId,
    clinicSlug: clinicSlugForSession,
  });

  const res = NextResponse.json({
    user: {
      id: account.id,
      name: account.name,
      email: account.login,
      role: account.role,
      staffId: account.staffId,
      status: "active" as const,
      clinicId,
      clinicSlug: clinicSlugForSession,
    },
  });

  res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));

  return res;
}
