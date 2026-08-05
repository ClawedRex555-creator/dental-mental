import { NextResponse } from "next/server";
import { createConnectionRequest } from "@/lib/platform-connection-requests.server";
import { isDatabaseEnabled } from "@/lib/db";
import {
  checkLoginRateLimitAsync,
  clientIpFromRequest,
  LANDING_RATE_MAX_ATTEMPTS,
  LANDING_RATE_WINDOW_MS,
  loginRateLimitResponse,
  recordLoginFailureAsync,
} from "@/lib/login-rate-limit";

function invalid(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Сервис временно недоступен" },
      { status: 503 }
    );
  }

  const ip = clientIpFromRequest(request) ?? "unknown";
  const rateKey = `landing:connection:${ip}`;
  const rate = await checkLoginRateLimitAsync(rateKey, LANDING_RATE_MAX_ATTEMPTS);
  if (!rate.allowed) {
    return loginRateLimitResponse(rate.retryAfterSec ?? 60);
  }
  // Считаем каждую заявку как attempt (антиспам), не только ошибки.
  await recordLoginFailureAsync(rateKey, LANDING_RATE_WINDOW_MS);

  let body: {
    clinicName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    desiredSlug?: string;
    message?: string;
    pdConsent?: boolean;
    marketingConsent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return invalid("Неверный формат запроса");
  }

  const clinicName = body.clinicName?.trim() ?? "";
  const contactName = body.contactName?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const desiredSlug = body.desiredSlug?.trim();
  const message = body.message?.trim();
  const pdConsent = Boolean(body.pdConsent);
  const marketingConsent = Boolean(body.marketingConsent);

  if (clinicName.length < 2) return invalid("Укажите название клиники");
  if (contactName.length < 2) return invalid("Укажите контактное лицо");
  if (phone.length < 7) return invalid("Укажите телефон");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("Укажите корректный email");
  if (desiredSlug && !/^[a-z0-9-]{2,63}$/.test(desiredSlug)) {
    return invalid("Желаемый адрес должен содержать только a-z, 0-9 и -");
  }
  if (!pdConsent) {
    return invalid("Необходимо согласие на обработку персональных данных");
  }

  try {
    const created = await createConnectionRequest({
      clinicName,
      contactName,
      phone,
      email,
      desiredSlug,
      message,
      source: "landing",
      pdConsent: true,
      marketingConsent,
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error("[landing/connection-requests POST]", error);
    return NextResponse.json(
      { ok: false, error: "Не удалось отправить заявку. Попробуйте позже." },
      { status: 500 }
    );
  }
}
