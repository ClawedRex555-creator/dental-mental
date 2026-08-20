import { NextResponse } from "next/server";
import { applySetPatientTeethToPersistedState } from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { ToothRecord } from "@/lib/types";

function parseTeeth(raw: unknown): ToothRecord[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: ToothRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.toothNumber !== "number" || !Number.isFinite(row.toothNumber)) return null;
    if (typeof row.condition !== "string" || !row.condition.trim()) return null;
    rows.push({
      toothNumber: Math.trunc(row.toothNumber),
      condition: row.condition as ToothRecord["condition"],
      vestibularConditions: Array.isArray(row.vestibularConditions)
        ? row.vestibularConditions.filter(
            (value): value is ToothRecord["condition"] => typeof value === "string"
          )
        : undefined,
      lingualConditions: Array.isArray(row.lingualConditions)
        ? row.lingualConditions.filter(
            (value): value is ToothRecord["condition"] => typeof value === "string"
          )
        : undefined,
      diagnosis:
        typeof row.diagnosis === "string" && row.diagnosis.trim() ? row.diagnosis : undefined,
      plannedTreatment:
        typeof row.plannedTreatment === "string" && row.plannedTreatment.trim()
          ? row.plannedTreatment
          : undefined,
      completedTreatment:
        typeof row.completedTreatment === "string" && row.completedTreatment.trim()
          ? row.completedTreatment
          : undefined,
      price:
        typeof row.price === "number" && Number.isFinite(row.price) ? row.price : undefined,
      status:
        typeof row.status === "string" && row.status.trim()
          ? (row.status as ToothRecord["status"])
          : undefined,
    });
  }
  return rows;
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение зубной карты" },
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

  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const teeth = parseTeeth(body.teeth);
  if (!patientId || !teeth) {
    return NextResponse.json(
      { ok: false, error: "Некорректная зубная карта" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applySetPatientTeethToPersistedState(state, {
      patientId,
      teeth,
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
