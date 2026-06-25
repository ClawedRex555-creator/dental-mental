import "server-only";

import { generateId } from "@/lib/utils";
import type { OnlineBookingRequest } from "@/lib/types";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { createFreshPersistedState } from "@/lib/clinic-persisted-state";
import type { MobilePatientAccount } from "@/lib/mobile-patient-db.server";

export interface MobileBookingInput {
  serviceId?: string;
  doctorId?: string;
  date: string;
  time: string;
  comment?: string;
}

export async function createMobileOnlineBooking(
  clinicId: string,
  patient: MobilePatientAccount,
  input: MobileBookingInput
): Promise<OnlineBookingRequest> {
  if (!input.date?.trim() || !input.time?.trim()) {
    throw new Error("Укажите дату и время");
  }

  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  const base = record?.data ?? createFreshPersistedState();

  if (input.serviceId && !base.services.some((s) => s.id === input.serviceId)) {
    throw new Error("Услуга не найдена");
  }
  if (input.doctorId && !base.doctors.some((d) => d.id === input.doctorId)) {
    throw new Error("Врач не найден");
  }

  const booking: OnlineBookingRequest = {
    id: generateId("ob"),
    patientName: patient.fullName,
    phone: patient.phone,
    serviceId: input.serviceId ?? base.services[0]?.id ?? "unknown",
    doctorId: input.doctorId,
    date: input.date.trim(),
    time: input.time.trim(),
    comment: input.comment?.trim() || `Заявка из Tstom (patientId: ${patient.patientId})`,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  await saveClinicDataDb(
    clinicId,
    {
      ...base,
      onlineBookings: [booking, ...base.onlineBookings.filter((b) => b.id !== booking.id)],
    },
    { allowEmptyResult: true }
  );

  return booking;
}
