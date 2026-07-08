import { NextResponse } from "next/server";
import { verifyNotificationActionToken } from "@/lib/notifications/action-token.server";
import { getClinicDataDb, saveClinicDataDb } from "@/lib/clinic-data-db.server";
import { isDatabaseEnabled } from "@/lib/db";

/** Публичное подтверждение записи по подписанной ссылке (без cookie) */
export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Неверная ссылка" }, { status: 400 });
  }

  const payload = verifyNotificationActionToken(token);
  if (!payload || payload.action !== "confirm") {
    return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 400 });
  }

  const snapshot = await getClinicDataDb(payload.clinicId);
  if (!snapshot) {
    return NextResponse.json({ error: "Клиника не найдена" }, { status: 404 });
  }

  const apt = snapshot.data.appointments.find((a) => a.id === payload.appointmentId);
  if (!apt || apt.patientId !== payload.patientId) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }

  if (apt.status === "cancelled") {
    return NextResponse.json({ ok: false, message: "Запись уже отменена" });
  }

  if (apt.status === "confirmed") {
    return NextResponse.json({ ok: true, message: "Запись уже была подтверждена" });
  }

  const appointments = snapshot.data.appointments.map((a) =>
    a.id === apt.id ? { ...a, status: "confirmed" as const } : a
  );

  await saveClinicDataDb(payload.clinicId, { ...snapshot.data, appointments });

  return NextResponse.json({
    ok: true,
    message: "Запись подтверждена. Ждём вас в клинике!",
  });
}
