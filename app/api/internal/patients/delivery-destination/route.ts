import { NextResponse } from "next/server";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import {
  findMisClinicBySignClinicId,
  readEmkaroSignEnv,
  verifyEmkaroSignHmac,
} from "@/lib/document-sign/emkaro-sign/config.server";
import { isDatabaseEnabled } from "@/lib/db";
import { normalizePhoneInput } from "@/lib/phone-utils";

interface DeliveryDestinationBody {
  emkaroPatientId?: string;
  clinicId?: string;
}

function isCompleteE164(phone: string): boolean {
  return /^\+7\d{10}$/.test(phone);
}

/**
 * Sign запрашивает номер для SMS в момент отправки.
 * HMAC = EMKARO_SIGN_WEBHOOK_SECRET (тот же, что webhook Sign → МИС).
 * clinicId — UUID клиники в Sign, не id клиники Emkaro.
 */
export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const { webhookSecret } = readEmkaroSignEnv();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook не настроен" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-emkaro-signature")?.trim() ?? "";
  if (!signature || !verifyEmkaroSignHmac(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Неверная подпись" }, { status: 401 });
  }

  let payload: DeliveryDestinationBody;
  try {
    payload = JSON.parse(rawBody) as DeliveryDestinationBody;
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const emkaroPatientId = payload.emkaroPatientId?.trim();
  const signClinicId = payload.clinicId?.trim();
  if (!emkaroPatientId || !signClinicId) {
    return NextResponse.json(
      { error: "Укажите emkaroPatientId и clinicId" },
      { status: 400 }
    );
  }

  const misClinic = await findMisClinicBySignClinicId(signClinicId);
  if (!misClinic) {
    return NextResponse.json({ error: "Клиника не найдена" }, { status: 404 });
  }

  const snapshot = await getClinicDataDb(misClinic.id);
  const patient = snapshot?.data.patients.find((p) => p.id === emkaroPatientId);
  if (!patient) {
    return NextResponse.json({ error: "Пациент не найден" }, { status: 404 });
  }

  const rawPhone = patient.phone?.trim();
  if (!rawPhone) {
    return NextResponse.json(
      { error: "У пациента не указан телефон", phoneStatus: "UNVERIFIED" },
      { status: 422 }
    );
  }

  const phone = normalizePhoneInput(rawPhone);
  if (!isCompleteE164(phone)) {
    return NextResponse.json(
      { error: "Телефон пациента некорректен", phoneStatus: "UNVERIFIED" },
      { status: 422 }
    );
  }

  return NextResponse.json({
    phone,
    phoneStatus: "VERIFIED",
  });
}
