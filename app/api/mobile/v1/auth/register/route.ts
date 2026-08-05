import { NextResponse } from "next/server";
import {
  checkLoginRateLimitAsync,
  clearLoginAttemptsAsync,
  clientIpFromRequest,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailureAsync,
} from "@/lib/login-rate-limit";
import { mobileAuthFromPatient } from "@/lib/mobile-auth-service.server";
import { resolveMobileClinicFromRequest } from "@/lib/mobile-clinic-context.server";
import { registerMobilePatient } from "@/lib/mobile-patient-db.server";

export async function POST(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  let body: {
    email?: string;
    password?: string;
    fullName?: string;
    phone?: string;
    birthDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const birthDate = body.birthDate?.trim() ?? "";

  if (!email || !password || !fullName || !phone || !birthDate) {
    return NextResponse.json(
      { error: "Заполните email, пароль, ФИО, телефон и дату рождения" },
      { status: 400 }
    );
  }

  const rateKey = loginRateLimitKey(
    `mobile-register:${clinic.slug}`,
    email,
    clientIpFromRequest(request)
  );
  const rate = await checkLoginRateLimitAsync(rateKey);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }

  try {
    const account = await registerMobilePatient({
      clinicId: clinic.clinicId,
      login: email,
      password,
      fullName,
      phone,
      birthDate,
    });
    await clearLoginAttemptsAsync(rateKey);
    const auth = mobileAuthFromPatient(account, clinic.slug);
    return NextResponse.json(auth, { status: 201 });
  } catch (e) {
    await recordLoginFailureAsync(rateKey);
    const message = e instanceof Error ? e.message : "Не удалось зарегистрироваться";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
