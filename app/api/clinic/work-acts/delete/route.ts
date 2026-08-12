import { NextResponse } from "next/server";
import { applyDeleteWorkActToPersistedState } from "@/lib/apply-work-act-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";

/**
 * Command API: удалить акт без полного client PUT snapshot.
 */
export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;

  let body: { actId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const actId =
    typeof body.actId === "string" && body.actId.trim() ? body.actId.trim() : "";
  if (!actId) {
    return NextResponse.json(
      { ok: false, error: "Не указан id акта" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeleteWorkActToPersistedState(state, actId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.actId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
