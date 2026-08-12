import { NextResponse } from "next/server";
import { applyUpsertPatientToPersistedState } from "@/lib/apply-patient-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { parsePatientPayload } from "@/lib/parse-appointment-command-body";

/**
 * Command API: сохранить карточку пациента без полного PUT snapshot.
 * Иначе conflict-merge / preferServer-pull откатывали ФИО на старые.
 */
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

  const patient = parsePatientPayload(body.patient ?? body);
  if (!patient) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные пациента" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertPatientToPersistedState(state, patient);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.patientId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
