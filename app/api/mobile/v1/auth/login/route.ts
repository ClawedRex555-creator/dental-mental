import { NextResponse } from "next/server";
import {
  checkLoginRateLimitAsync,
  clearLoginAttemptsAsync,
  clientIpFromRequest,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailureAsync,
} from "@/lib/login-rate-limit";
import { loginMobileUser } from "@/lib/mobile-auth-service.server";
import { resolveMobileClinicFromRequest } from "@/lib/mobile-clinic-context.server";

export async function POST(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  let body: { login?: string; password?: string; preferredKind?: string };
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

  const preferredKind =
    body.preferredKind === "patient" || body.preferredKind === "staff"
      ? body.preferredKind
      : undefined;

  const rateKey = loginRateLimitKey(
    `mobile:${clinic.slug}`,
    login,
    clientIpFromRequest(request)
  );
  const rate = await checkLoginRateLimitAsync(rateKey);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }

  const result = await loginMobileUser({
    clinicId: clinic.clinicId,
    clinicSlug: clinic.slug,
    login,
    password,
    preferredKind,
  });

  if (!result) {
    await recordLoginFailureAsync(rateKey);
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  await clearLoginAttemptsAsync(rateKey);
  return NextResponse.json(result);
}
