import { NextResponse } from "next/server";
import { applyUpsertPatientFileToPersistedState } from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { PatientFile } from "@/lib/types";

function parsePatientFile(raw: unknown): PatientFile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.patientId !== "string" || !row.patientId.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (
    row.type !== "xray" &&
    row.type !== "ct" &&
    row.type !== "photo" &&
    row.type !== "contract" &&
    row.type !== "consent" &&
    row.type !== "document" &&
    row.type !== "other"
  ) {
    return null;
  }
  if (typeof row.uploadedAt !== "string" || !row.uploadedAt.trim()) return null;
  return {
    id: row.id.trim(),
    patientId: row.patientId.trim(),
    name: row.name.trim(),
    type: row.type,
    uploadedAt: row.uploadedAt.trim(),
    dataUrl: typeof row.dataUrl === "string" && row.dataUrl.length > 0 ? row.dataUrl : undefined,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение файлов пациента" },
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

  const file = parsePatientFile(body.file ?? body);
  if (!file) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные файла пациента" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertPatientFileToPersistedState(state, file);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
