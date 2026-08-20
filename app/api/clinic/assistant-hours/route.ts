import { NextResponse } from "next/server";
import { applySetAssistantManualHoursToPersistedState } from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение часов ассистентов" },
      { status: 403, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const assistantId =
    typeof body.assistantId === "string" ? body.assistantId.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const hours = typeof body.hours === "string" ? body.hours : "";
  if (!assistantId || !date) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные смены" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applySetAssistantManualHoursToPersistedState(state, {
      assistantId,
      date,
      hours,
    });
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
