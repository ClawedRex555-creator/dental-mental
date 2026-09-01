import { NextResponse } from "next/server";
import { applyUpdateOnlineBookingToPersistedState } from "@/lib/apply-online-booking-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { OnlineBookingStatus } from "@/lib/types";

const ALLOWED: OnlineBookingStatus[] = ["contacted", "booked", "cancelled"];

/** Command API: обновить статус заявки онлайн-записи (и создать приём при «Записан»). */
export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;

  let body: { bookingId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const bookingId =
    typeof body.bookingId === "string" && body.bookingId.trim()
      ? body.bookingId.trim()
      : "";
  const status = body.status as OnlineBookingStatus;

  if (!bookingId) {
    return NextResponse.json(
      { ok: false, error: "Не указан id заявки" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Некорректный статус" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) =>
    applyUpdateOnlineBookingToPersistedState(state, bookingId, status)
  );
}
