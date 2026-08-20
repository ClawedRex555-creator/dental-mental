import { NextResponse } from "next/server";
import {
  applyAssignStaffToCabinetToPersistedState,
  applyDeleteCabinetToPersistedState,
  applyUpsertCabinetToPersistedState,
} from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { Cabinet } from "@/lib/types";

type CabinetAction = "upsert" | "delete" | "assign_staff";

function parseCabinet(raw: unknown): Cabinet | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (typeof row.number !== "string" || !row.number.trim()) return null;
  const equipment = Array.isArray(row.equipment)
    ? row.equipment.filter((item): item is string => typeof item === "string")
    : [];
  const staffIds = Array.isArray(row.staffIds)
    ? row.staffIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];
  const status =
    row.status === "maintenance" || row.status === "inactive" ? row.status : "active";
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    number: row.number.trim(),
    equipment,
    staffIds,
    status,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "owner" && auth.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение кабинетов" },
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

  const action = body.action;
  if (action !== "upsert" && action !== "delete" && action !== "assign_staff") {
    return NextResponse.json(
      { ok: false, error: "Неизвестная команда кабинетов" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const command = action as CabinetAction;
  if (command === "upsert") {
    const cabinet = parseCabinet(body.cabinet);
    if (!cabinet) {
      return NextResponse.json(
        { ok: false, error: "Некорректные данные кабинета" },
        { status: 400, headers: APPOINTMENT_CMD_HEADERS }
      );
    }
    return saveAppointmentCommandResult(auth.clinicId, (state) => {
      const applied = applyUpsertCabinetToPersistedState(state, cabinet);
      if (!applied.ok) return applied;
      return {
        ok: true,
        state: applied.state,
        appointmentId: applied.entityId,
        alreadyApplied: applied.alreadyApplied,
      };
    });
  }

  if (command === "delete") {
    const cabinetId =
      typeof body.cabinetId === "string" ? body.cabinetId.trim() : "";
    if (!cabinetId) {
      return NextResponse.json(
        { ok: false, error: "Не указан кабинет" },
        { status: 400, headers: APPOINTMENT_CMD_HEADERS }
      );
    }
    return saveAppointmentCommandResult(auth.clinicId, (state) => {
      const applied = applyDeleteCabinetToPersistedState(state, cabinetId);
      if (!applied.ok) return applied;
      return {
        ok: true,
        state: applied.state,
        appointmentId: applied.entityId,
        alreadyApplied: applied.alreadyApplied,
      };
    });
  }

  const cabinetId =
    typeof body.cabinetId === "string" ? body.cabinetId.trim() : "";
  const staffId = typeof body.staffId === "string" ? body.staffId.trim() : "";
  if (!cabinetId || !staffId) {
    return NextResponse.json(
      { ok: false, error: "Не указан кабинет или сотрудник" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyAssignStaffToCabinetToPersistedState(state, cabinetId, staffId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
