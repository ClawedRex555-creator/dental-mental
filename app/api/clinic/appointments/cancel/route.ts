import { NextResponse } from "next/server";
import { applyCancelAppointmentToPersistedState } from "@/lib/apply-appointment-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";

/** Command API: отменить запись (status=cancelled) без полного client PUT. */
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

  const appointmentId =
    typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  if (!appointmentId) {
    return NextResponse.json(
      { ok: false, error: "Не указана запись" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) =>
    applyCancelAppointmentToPersistedState(state, appointmentId)
  );
}
