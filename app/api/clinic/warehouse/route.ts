import { NextResponse } from "next/server";
import {
  applyDeleteWarehouseItemToPersistedState,
  applyUpsertWarehouseItemToPersistedState,
} from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { WarehouseItem } from "@/lib/types";

type WarehouseAction = "upsert" | "delete";

function parseWarehouseItem(raw: unknown): WarehouseItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (typeof row.category !== "string" || !row.category.trim()) return null;
  const quantity =
    typeof row.quantity === "number"
      ? row.quantity
      : typeof row.quantity === "string"
        ? Number(row.quantity)
        : NaN;
  const minQuantity =
    typeof row.minQuantity === "number"
      ? row.minQuantity
      : typeof row.minQuantity === "string"
        ? Number(row.minQuantity)
        : NaN;
  if (!Number.isFinite(quantity) || !Number.isFinite(minQuantity)) return null;
  if (typeof row.unit !== "string" || !row.unit.trim()) return null;
  if (typeof row.purchasePrice !== "number" && typeof row.purchasePrice !== "string") return null;
  const purchasePrice =
    typeof row.purchasePrice === "number" ? row.purchasePrice : Number(row.purchasePrice);
  if (!Number.isFinite(purchasePrice)) return null;
  if (typeof row.supplier !== "string" || !row.supplier.trim()) return null;
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    category: row.category.trim(),
    quantity,
    minQuantity,
    unit: row.unit.trim(),
    purchasePrice,
    supplier: row.supplier.trim(),
    expirationDate:
      typeof row.expirationDate === "string" && row.expirationDate.trim()
        ? row.expirationDate.trim()
        : undefined,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение склада" },
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
  if (action !== "upsert" && action !== "delete") {
    return NextResponse.json(
      { ok: false, error: "Неизвестная команда склада" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  if ((action as WarehouseAction) === "upsert") {
    const item = parseWarehouseItem(body.item);
    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Некорректные данные склада" },
        { status: 400, headers: APPOINTMENT_CMD_HEADERS }
      );
    }
    return saveAppointmentCommandResult(auth.clinicId, (state) => {
      const applied = applyUpsertWarehouseItemToPersistedState(state, item);
      if (!applied.ok) return applied;
      return {
        ok: true,
        state: applied.state,
        appointmentId: applied.entityId,
        alreadyApplied: applied.alreadyApplied,
      };
    });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) {
    return NextResponse.json(
      { ok: false, error: "Не указан складской остаток" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeleteWarehouseItemToPersistedState(state, itemId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
