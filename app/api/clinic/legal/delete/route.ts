import { NextResponse } from "next/server";
import { applyDeleteLegalDocumentToPersistedState } from "@/lib/apply-legal-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { canManageLegalDocuments } from "@/lib/rbac";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";

/** Command API: удалить юр. документ без полного PUT snapshot. */
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
  if (!canManageLegalDocuments(role)) {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение юр. документов" },
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

  const documentId =
    typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "Не указан документ" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeleteLegalDocumentToPersistedState(state, documentId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.documentId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
