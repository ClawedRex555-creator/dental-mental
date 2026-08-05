import { NextResponse } from "next/server";
import { getMobileAvailableSlots } from "@/lib/mobile-availability.server";
import {
  isMobileModuleEnabled,
  resolveMobileClinicFromRequest,
} from "@/lib/mobile-clinic-context.server";

/** Публичные свободные слоты (с учётом приёмов в МИС). */
export async function GET(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  const enabled = await isMobileModuleEnabled(
    clinic.clinicId,
    clinic.slug,
    "online_booking"
  );
  if (!enabled) {
    return NextResponse.json({ freeSlots: [], busySlots: [], onlineBookingEnabled: false });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Укажите date=YYYY-MM-DD" }, { status: 400 });
  }

  const doctorId = url.searchParams.get("doctorId")?.trim() || null;
  const slots = await getMobileAvailableSlots(clinic.clinicId, date, doctorId);
  return NextResponse.json({
    date,
    doctorId,
    onlineBookingEnabled: true,
    ...slots,
  });
}
