import { NextResponse } from "next/server";
import { applyUpsertWorkActToPersistedState } from "@/lib/apply-work-act-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { WorkAct } from "@/lib/types";

function isWorkActBody(value: unknown): value is WorkAct {
  if (!value || typeof value !== "object") return false;
  const act = value as Partial<WorkAct>;
  return typeof act.id === "string" && act.id.trim().length > 0;
}

/**
 * Command API: создать/обновить акт без полного client PUT snapshot.
 */
export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;

  let body: {
    act?: unknown;
    linkAppointmentId?: unknown;
    submittedToAdmin?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  if (!isWorkActBody(body.act)) {
    return NextResponse.json(
      { ok: false, error: "Не указан акт" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const linkAppointmentId =
    body.linkAppointmentId === null
      ? null
      : typeof body.linkAppointmentId === "string" && body.linkAppointmentId.trim()
        ? body.linkAppointmentId.trim()
        : undefined;

  const submittedToAdmin =
    typeof body.submittedToAdmin === "boolean" ? body.submittedToAdmin : undefined;

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertWorkActToPersistedState(state, body.act as WorkAct, {
      linkAppointmentId,
      submittedToAdmin,
    });
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.actId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
