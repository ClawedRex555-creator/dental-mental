import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth-session";
import { requireSuperAdminSession } from "@/lib/get-server-session";
import { verifySameOrigin } from "@/lib/csrf-origin";
import {
  findPlatformAdminByLogin,
  verifyPlatformPassword,
  ensureBootstrapSuperAdmin,
} from "@/lib/platform-auth.server";
import {
  checkLoginRateLimitAsync,
  clearLoginAttemptsAsync,
  clientIpFromRequest,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailureAsync,
} from "@/lib/login-rate-limit";
import { isDatabaseEnabled } from "@/lib/db";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!login || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }

  await ensureBootstrapSuperAdmin();

  const rateKey = loginRateLimitKey("platform", login, clientIpFromRequest(request));
  const rate = await checkLoginRateLimitAsync(rateKey);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }

  const admin = await findPlatformAdminByLogin(login);
  if (!admin || !verifyPlatformPassword(admin.passwordHash, password)) {
    await recordLoginFailureAsync(rateKey);
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  await clearLoginAttemptsAsync(rateKey);

  const token = createSessionToken({
    userId: admin.id,
    role: "owner",
    name: admin.name,
    email: admin.login,
    isSuperAdmin: true,
  });

  const res = NextResponse.json({
    user: { id: admin.id, name: admin.name, email: admin.login, isSuperAdmin: true },
  });
  res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7, request));
  return res;
}

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      isSuperAdmin: true,
    },
  });
}
