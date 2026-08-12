import { NextResponse } from "next/server";
import { applyDeletePatientToPersistedState } from "@/lib/apply-patient-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";

/**
 * Command API: удалить пациента без полного PUT snapshot.
 * Иначе conflict-merge / preferLocal PUT могли воскресить карточку или зависимые сущности.
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

  const patientId =
    typeof body.patientId === "string"
      ? body.patientId.trim()
      : typeof body.id === "string"
        ? body.id.trim()
        : "";
  if (!patientId) {
    return NextResponse.json(
      { ok: false, error: "Не указан пациент" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeletePatientToPersistedState(state, patientId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.patientId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
