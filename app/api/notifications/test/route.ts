import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { dispatchNotificationDelivery } from "@/lib/notifications/dispatch.server";
import { insertNotificationDelivery } from "@/lib/notifications/db.server";
import type { NotificationChannel } from "@/lib/notifications/types";
import { parseNotificationChannel } from "@/lib/notifications/defaults";
import { getNotificationConfig } from "@/lib/notifications/settings.server";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  let body: {
    patientId?: string;
    appointmentId?: string;
    channel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const snapshot = await getClinicDataDb(ctx.clinicId);
  if (!snapshot) {
    return NextResponse.json({ error: "Нет данных клиники" }, { status: 404 });
  }

  const appointment = snapshot.data.appointments.find((a) => a.id === body.appointmentId);
  const patient = snapshot.data.patients.find((p) => p.id === body.patientId);
  if (!appointment || !patient) {
    return NextResponse.json({ error: "Запись или пациент не найдены" }, { status: 404 });
  }

  const channel = parseNotificationChannel(body.channel) ?? ("mock" as NotificationChannel);
  const config = await getNotificationConfig(ctx.clinicId);
  const isTestSend = config.settings.testMode;

  const deliveryId = await insertNotificationDelivery({
    clinicId: ctx.clinicId,
    patientId: patient.id,
    appointmentId: appointment.id,
    channel,
    eventType: "appointment_reminder",
    reminderOffsetMinutes: 0,
    scheduledAt: new Date(),
    isTest: isTestSend,
    messagePreview: isTestSend
      ? "Тестовое уведомление (mock)"
      : "Проверочное уведомление (реальный канал)",
  });

  if (!deliveryId) {
    return NextResponse.json({ error: "Не удалось создать запись отправки (возможно дубликат)" }, { status: 409 });
  }

  const { getNotificationDelivery } = await import("@/lib/notifications/db.server");
  const row = await getNotificationDelivery(ctx.clinicId, deliveryId);
  if (!row) {
    return NextResponse.json({ error: "Запись отправки не найдена" }, { status: 500 });
  }

  const result = await dispatchNotificationDelivery(row);
  return NextResponse.json({
    ok: result.ok,
    deliveryId,
    mode: isTestSend ? "mock" : "live",
    error: result.error,
  });
}
