import { NextResponse } from "next/server";
import { applyCreateAppointmentToPersistedState } from "@/lib/apply-appointment-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import {
  parseAppointmentPayload,
  parsePatientPayload,
} from "@/lib/parse-appointment-command-body";
import { isPartnerClinicRole, partnerBookingStamp } from "@/lib/partner-clinic";

/** Command API: создать запись без полного client PUT snapshot. */
export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const appointment = parseAppointmentPayload(body.appointment ?? body);
  if (!appointment) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные записи" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const patient = parsePatientPayload(body.patient);
  if (patient && patient.id !== appointment.patientId) {
    return NextResponse.json(
      { ok: false, error: "Пациент не совпадает с записью" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const stamped = isPartnerClinicRole(auth.role)
    ? { ...appointment, ...partnerBookingStamp({ role: auth.role, name: auth.name }) }
    : { ...appointment, bookedByPartner: undefined, partnerClinicName: undefined };

  return saveAppointmentCommandResult(auth.clinicId, (state) =>
    applyCreateAppointmentToPersistedState(state, stamped, patient)
  );
}
