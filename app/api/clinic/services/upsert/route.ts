import { NextResponse } from "next/server";
import { applyUpsertServiceToPersistedState } from "@/lib/apply-service-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { canManageServices } from "@/lib/rbac";
import { normalizeServiceFields } from "@/lib/service-categories";
import type { Service } from "@/lib/types";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";

function parseServicePayload(raw: unknown): Service | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !s.id.trim()) return null;
  if (typeof s.name !== "string") return null;
  if (typeof s.category !== "string" || !s.category.trim()) return null;
  const price =
    typeof s.price === "number"
      ? s.price
      : typeof s.price === "string"
        ? Number(s.price)
        : NaN;
  if (!Number.isFinite(price)) return null;

  return normalizeServiceFields({
    id: s.id.trim(),
    name: s.name.trim(),
    category: s.category.trim(),
    price,
    priceIsFrom: s.priceIsFrom === true,
    notes: typeof s.notes === "string" && s.notes.trim() ? s.notes.trim() : undefined,
    nmuCode: typeof s.nmuCode === "string" && s.nmuCode.trim() ? s.nmuCode.trim() : undefined,
    linkedClinicServiceId:
      typeof s.linkedClinicServiceId === "string" && s.linkedClinicServiceId.trim()
        ? s.linkedClinicServiceId.trim()
        : undefined,
    linkedClinicServiceName:
      typeof s.linkedClinicServiceName === "string" && s.linkedClinicServiceName.trim()
        ? s.linkedClinicServiceName.trim()
        : undefined,
    technicianName:
      typeof s.technicianName === "string" && s.technicianName.trim()
        ? s.technicianName.trim()
        : undefined,
    active: s.active === false ? false : true,
  });
}

/**
 * Command API: сохранить услугу без полного PUT snapshot.
 * Иначе conflict-merge / stale PUT откатывали название и категорию.
 */
export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;

  const store = await cookies();
  const session = asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
  if (!session?.clinicId) {
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён" },
      { status: 403, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  const role = authUser?.role ?? session.role;
  if (!canManageServices(role)) {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение прайса" },
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

  const service = parseServicePayload(body.service ?? body);
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные услуги" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertServiceToPersistedState(state, service);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.serviceId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
