import { NextResponse } from "next/server";
import {
  applyUpsertLegalDocumentToPersistedState,
  normalizeLegalDocument,
} from "@/lib/apply-legal-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { canManageLegalDocuments } from "@/lib/rbac";
import type { LegalDocument } from "@/lib/types";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";

function parseLegalDocumentPayload(raw: unknown): LegalDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id.trim()) return null;
  if (typeof d.title !== "string") return null;
  if (typeof d.category !== "string" || !d.category.trim()) return null;
  const date =
    typeof d.date === "string" && d.date.trim()
      ? d.date.trim()
      : new Date().toISOString().slice(0, 10);

  return normalizeLegalDocument({
    id: d.id.trim(),
    title: d.title,
    category: d.category.trim(),
    date,
    fileDataUrl:
      typeof d.fileDataUrl === "string" && d.fileDataUrl.length > 0
        ? d.fileDataUrl
        : undefined,
    templateUrl:
      typeof d.templateUrl === "string" && d.templateUrl.trim()
        ? d.templateUrl.trim()
        : undefined,
    fileName:
      typeof d.fileName === "string" && d.fileName.trim()
        ? d.fileName.trim()
        : undefined,
    notes:
      typeof d.notes === "string" && d.notes.trim() ? d.notes.trim() : undefined,
  });
}

/**
 * Command API: сохранить юр. документ без полного PUT snapshot.
 * Иначе conflict-merge / stale PUT откатывали новый файл или название.
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

  const document = parseLegalDocumentPayload(body.document ?? body);
  if (!document) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные документа" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyUpsertLegalDocumentToPersistedState(state, document);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.documentId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
