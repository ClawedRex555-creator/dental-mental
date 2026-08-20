import { NextResponse } from "next/server";
import { applyUpsertDoctorScheduleToPersistedState } from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { DoctorMonthSchedule, DoctorShiftDay } from "@/lib/types";

function parseDays(raw: unknown): Record<string, DoctorShiftDay | boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const output: Record<string, DoctorShiftDay | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof value === "boolean") {
      output[key] = value;
      continue;
    }
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.working !== "boolean") return null;
    if (typeof row.startTime !== "string" || typeof row.endTime !== "string") return null;
    output[key] = {
      working: row.working,
      startTime: row.startTime,
      endTime: row.endTime,
    };
  }
  return output;
}

function parseSchedule(raw: unknown): DoctorMonthSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.doctorId !== "string" || !row.doctorId.trim()) return null;
  if (typeof row.month !== "string" || !row.month.trim()) return null;
  const days = parseDays(row.days);
  if (!days) return null;
  const updatedAt = new Date().toISOString();
  return {
    doctorId: row.doctorId.trim(),
    month: row.month.trim(),
    days,
    updatedAt,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "owner" && auth.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение графика" },
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

  const schedule = parseSchedule(body.schedule ?? body);
  if (!schedule) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные графика" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertDoctorScheduleToPersistedState(state, schedule);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
