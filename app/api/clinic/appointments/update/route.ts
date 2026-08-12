import { NextResponse } from "next/server";
import { applyUpdateAppointmentToPersistedState } from "@/lib/apply-appointment-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import {
  parseAppointmentPatch,
  parseAppointmentPayload,
} from "@/lib/parse-appointment-command-body";
import type { AppointmentCommandPatch } from "@/lib/apply-appointment-commands";

/** Command API: обновить запись без полного client PUT snapshot. */
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
    typeof body.appointmentId === "string"
      ? body.appointmentId.trim()
      : typeof (body.appointment as { id?: string } | undefined)?.id === "string"
        ? String((body.appointment as { id: string }).id).trim()
        : "";
  if (!appointmentId) {
    return NextResponse.json(
      { ok: false, error: "Не указана запись" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  let patch: AppointmentCommandPatch | null = null;
  if (body.appointment != null) {
    const raw = body.appointment as Record<string, unknown>;
    const full = parseAppointmentPayload(body.appointment);
    if (full) {
      const { id: _id, ...rest } = full;
      void _id;
      patch = { ...rest };
      // Явный null/"" с клиента снимает workActId; отсутствие ключа — не трогаем.
      if ("workActId" in raw && (raw.workActId === null || raw.workActId === "")) {
        patch.workActId = null;
      }
    } else {
      patch = parseAppointmentPatch(body.appointment);
    }
  } else if (body.patch != null) {
    patch = parseAppointmentPatch(body.patch);
  }

  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Нет полей для обновления" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) =>
    applyUpdateAppointmentToPersistedState(state, appointmentId, patch)
  );
}
