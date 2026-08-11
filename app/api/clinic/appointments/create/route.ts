import { NextResponse } from "next/server";
import { applyCreateAppointmentToPersistedState } from "@/lib/apply-appointment-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { parseAppointmentPayload } from "@/lib/parse-appointment-command-body";

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

  return saveAppointmentCommandResult(auth.clinicId, (state) =>
    applyCreateAppointmentToPersistedState(state, appointment)
  );
}
