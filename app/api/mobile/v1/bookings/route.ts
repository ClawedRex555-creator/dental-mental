import { NextResponse } from "next/server";
import { createMobileOnlineBooking } from "@/lib/mobile-booking.server";
import {
  isMobileModuleEnabled,
  resolveMobileClinicFromRequest,
} from "@/lib/mobile-clinic-context.server";
import { requireMobileSession } from "@/lib/mobile-auth-request.server";
import { findMobilePatientByLogin } from "@/lib/mobile-patient-db.server";

export async function POST(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  const session = requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (session.clinicId !== clinic.clinicId) {
    return NextResponse.json({ error: "Сессия другой клиники" }, { status: 403 });
  }
  if (session.kind !== "patient" || !session.patientId) {
    return NextResponse.json(
      { error: "Запись доступна только пациентам приложения" },
      { status: 403 }
    );
  }

  const enabled = await isMobileModuleEnabled(clinic.clinicId, clinic.slug, "online_booking");
  if (!enabled) {
    return NextResponse.json({ error: "Онлайн-запись отключена для клиники" }, { status: 403 });
  }

  let body: {
    serviceId?: string;
    doctorId?: string;
    date?: string;
    time?: string;
    comment?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const patientAccount = await findMobilePatientByLogin(clinic.clinicId, session.email);
  if (!patientAccount) {
    return NextResponse.json({ error: "Аккаунт пациента не найден" }, { status: 404 });
  }

  try {
    const booking = await createMobileOnlineBooking(clinic.clinicId, patientAccount, {
      serviceId: body.serviceId,
      doctorId: body.doctorId,
      date: body.date ?? "",
      time: body.time ?? "",
      comment: body.comment,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось создать заявку";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
