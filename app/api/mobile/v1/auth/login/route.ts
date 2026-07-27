import { NextResponse } from "next/server";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { loginMobileUser } from "@/lib/mobile-auth-service.server";
import { resolveMobileClinicFromRequest } from "@/lib/mobile-clinic-context.server";

export async function POST(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!login || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const rateKey = loginRateLimitKey(`mobile:${clinic.slug}`, login);
  const rate = checkLoginRateLimit(rateKey);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }

  const result = await loginMobileUser({
    clinicId: clinic.clinicId,
    clinicSlug: clinic.slug,
    login,
    password,
  });

  if (!result) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  clearLoginAttempts(rateKey);
  return NextResponse.json(result);
}
