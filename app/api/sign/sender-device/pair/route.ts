import { NextResponse } from "next/server";
import { completePairing } from "@/lib/document-sign/clinic-sms/devices.server";
import {
  PAIRING_ATTEMPT_RATE_MAX,
  PAIRING_RATE_WINDOW_MS,
} from "@/lib/document-sign/clinic-sms/rules";
import {
  checkSignSenderRateLimit,
  recordSignSenderRateLimit,
} from "@/lib/document-sign/clinic-sms/rate-limit";
import { isDatabaseEnabled } from "@/lib/db";

/** Публичное завершение pairing с телефона (без staff-cookie). */
export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const rateKey = `pair-attempt:${ip}`;
  const rate = checkSignSenderRateLimit(rateKey, PAIRING_ATTEMPT_RATE_MAX);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток", retryAfterSec: rate.retryAfterSec },
      { status: 429 }
    );
  }
  recordSignSenderRateLimit(rateKey, PAIRING_RATE_WINDOW_MS);

  let body: {
    token?: string;
    shortCode?: string;
    clinicId?: string;
    displayName?: string;
    declaredPhoneNumber?: string;
    deviceName?: string;
    platform?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.token && !body.shortCode) {
    return NextResponse.json({ error: "Укажите token или shortCode" }, { status: 400 });
  }

  const result = await completePairing({
    token: body.token,
    shortCode: body.shortCode,
    clinicIdHint: body.clinicId,
    displayName: body.displayName,
    declaredPhoneNumber: body.declaredPhoneNumber,
    deviceName: body.deviceName,
    platform: body.platform,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    deviceId: result.deviceId,
    deviceToken: result.deviceToken,
    clinicId: result.clinicId,
  });
}
