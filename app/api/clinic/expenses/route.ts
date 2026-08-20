import { NextResponse } from "next/server";
import {
  applyDeleteClinicExpenseToPersistedState,
  applyUpsertClinicExpenseToPersistedState,
} from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { ClinicExpense } from "@/lib/types";

type ExpensesAction = "upsert" | "delete";

function parseExpense(raw: unknown): ClinicExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.description !== "string" || !row.description.trim()) return null;
  if (typeof row.category !== "string" || !row.category.trim()) return null;
  if (typeof row.date !== "string" || !row.date.trim()) return null;
  const amount =
    typeof row.amount === "number"
      ? row.amount
      : typeof row.amount === "string"
        ? Number(row.amount)
        : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    id: row.id.trim(),
    description: row.description.trim(),
    category: row.category.trim(),
    amount,
    date: row.date.trim(),
    receiptDataUrl:
      typeof row.receiptDataUrl === "string" && row.receiptDataUrl.length > 0
        ? row.receiptDataUrl
        : undefined,
    paidByStaffId:
      typeof row.paidByStaffId === "string" && row.paidByStaffId.trim()
        ? row.paidByStaffId.trim()
        : undefined,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение расходов" },
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
      { ok: false, error: "Неизвестная команда расходов" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  if ((action as ExpensesAction) === "upsert") {
    const expense = parseExpense(body.expense);
    if (!expense) {
      return NextResponse.json(
        { ok: false, error: "Некорректные данные расхода" },
        { status: 400, headers: APPOINTMENT_CMD_HEADERS }
      );
    }
    return saveAppointmentCommandResult(auth.clinicId, (state) => {
      const applied = applyUpsertClinicExpenseToPersistedState(state, expense);
      if (!applied.ok) return applied;
      return {
        ok: true,
        state: applied.state,
        appointmentId: applied.entityId,
        alreadyApplied: applied.alreadyApplied,
      };
    });
  }

  const expenseId = typeof body.expenseId === "string" ? body.expenseId.trim() : "";
  if (!expenseId) {
    return NextResponse.json(
      { ok: false, error: "Не указан расход" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeleteClinicExpenseToPersistedState(state, expenseId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
