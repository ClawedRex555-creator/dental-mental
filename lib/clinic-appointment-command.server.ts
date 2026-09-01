import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import type { ApplyAppointmentResult } from "@/lib/apply-appointment-commands";
import { canWriteClinicDataSync } from "@/lib/clinic-data-access";
import {
  ClinicRevisionConflictError,
  getClinicDataDbWithLegacyStaff,
  PatientMassLossGuardError,
  ScheduleMassLossGuardError,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { isModuleEnabled } from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";

export const APPOINTMENT_CMD_HEADERS = {
  "Cache-Control": "private, no-store, must-revalidate",
  Vary: "Cookie",
};

const COMMAND_SAVE_ATTEMPTS = 3;

export function parseExpectedCas(body: {
  expectedUpdatedAt?: unknown;
  expectedRevision?: unknown;
}): { expectedUpdatedAt: string | null; expectedRevision: number | null } {
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt.trim()
      ? body.expectedUpdatedAt.trim()
      : null;
  const expectedRevision =
    typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
      ? Math.max(0, Math.floor(body.expectedRevision))
      : null;
  return { expectedUpdatedAt, expectedRevision };
}

type SessionOk = {
  ok: true;
  clinicId: string;
  role: import("@/lib/types").UserRole;
  name: string;
};

type SessionFail = { ok: false; response: NextResponse };

/** CSRF + session + host + write ACL for appointment command routes. */
export async function requireAppointmentCommandSession(
  request: Request
): Promise<SessionOk | SessionFail> {
  if (!verifySameOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Запрос отклонён" },
        { status: 403, headers: APPOINTMENT_CMD_HEADERS }
      ),
    };
  }
  if (!isDatabaseEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "База данных недоступна" },
        { status: 503, headers: APPOINTMENT_CMD_HEADERS }
      ),
    };
  }

  const store = await cookies();
  const session = asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Доступ запрещён" },
        { status: 403, headers: APPOINTMENT_CMD_HEADERS }
      ),
    };
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return { ok: false, response: hostDenied };

  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  const role = authUser?.role ?? session.role;
  if (!authUser || !canWriteClinicDataSync(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Нет прав на изменение расписания" },
        { status: 403, headers: APPOINTMENT_CMD_HEADERS }
      ),
    };
  }

  return { ok: true, clinicId: session.clinicId, role, name: authUser.name || session.name };
}

async function maybeNotifyAfterAppointmentCommand(
  clinicId: string,
  prevSnapshot: ClinicPersistedState,
  nextSnapshot: ClinicPersistedState
): Promise<void> {
  const modules = await getClinicModules(clinicId);
  if (!isModuleEnabled(modules, "notifications")) return;
  const { maybeSyncAppointmentNotifications, maybeNotifyClinicStaffEvents } = await import(
    "@/lib/notifications/worker.server"
  );
  await maybeSyncAppointmentNotifications(
    clinicId,
    prevSnapshot.appointments,
    nextSnapshot.appointments
  ).catch(() => undefined);
  await maybeNotifyClinicStaffEvents({
    clinicId,
    prevSnapshot,
    nextSnapshot,
  }).catch(() => undefined);
}

export type AppointmentCommandSaveResult =
  | {
      ok: true;
      appointmentId: string;
      alreadyApplied: boolean;
      updatedAt: string;
      revision: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
      code?: string;
      serverUpdatedAt?: string | null;
    };

/** CAS save для command API и mobile staff (без cookie/CSRF). */
export async function executeAppointmentCommandSave(
  clinicId: string,
  apply: (state: ClinicPersistedState) => ApplyAppointmentResult,
  options?: { notify?: boolean }
): Promise<AppointmentCommandSaveResult> {
  const notify = options?.notify !== false;
  let lastConflictUpdatedAt: string | null = null;

  for (let attempt = 0; attempt < COMMAND_SAVE_ATTEMPTS; attempt++) {
    const existing = await getClinicDataDbWithLegacyStaff(clinicId);
    if (!existing?.data) {
      return { ok: false, error: "Нет данных клиники", status: 404 };
    }

    const applied = apply(existing.data);
    if (!applied.ok) {
      return { ok: false, error: applied.error, status: 400 };
    }

    if (applied.alreadyApplied) {
      return {
        ok: true,
        appointmentId: applied.appointmentId,
        alreadyApplied: true,
        updatedAt: existing.updatedAt,
        revision: existing.revision,
      };
    }

    try {
      const saved = await saveClinicDataDb(clinicId, applied.state, {
        expectedUpdatedAt: existing.updatedAt,
        expectedRevision: existing.revision,
        autoMergeOnVersionConflict: false,
        replaceAppliedSnapshot: true,
      });
      if (notify) {
        await maybeNotifyAfterAppointmentCommand(
          clinicId,
          existing.data,
          saved.data
        ).catch(() => undefined);
      }
      return {
        ok: true,
        appointmentId: applied.appointmentId,
        alreadyApplied: false,
        updatedAt: saved.updatedAt,
        revision: saved.revision,
      };
    } catch (e) {
      if (e instanceof ClinicRevisionConflictError) {
        lastConflictUpdatedAt = e.serverUpdatedAt;
        if (attempt < COMMAND_SAVE_ATTEMPTS - 1) continue;
        return {
          ok: false,
          error: "Конфликт версии — обновите данные и повторите",
          status: 409,
          code: e.code,
          serverUpdatedAt: e.serverUpdatedAt,
        };
      }
      if (e instanceof PatientMassLossGuardError || e instanceof ScheduleMassLossGuardError) {
        return { ok: false, error: e.message, status: 409, code: e.code };
      }
      const msg = e instanceof Error ? e.message : "Не удалось сохранить запись";
      return { ok: false, error: msg, status: 500 };
    }
  }

  return {
    ok: false,
    error: "Конфликт версии — обновите данные и повторите",
    status: 409,
    code: "REVISION_CONFLICT",
    serverUpdatedAt: lastConflictUpdatedAt,
  };
}

/**
 * Сохранить результат command API.
 *
 * Важно: НЕ используем autoMergeOnVersionConflict.
 * mergeClinicDataOnWriteConflict для appointments предпочитает server/old и
 * молча откатывает смену статуса при устаревшем client CAS.
 * Вместо этого: load → apply → CAS от свежей строки → retry при конфликте.
 */
export async function saveAppointmentCommandResult(
  clinicId: string,
  apply: (state: ClinicPersistedState) => ApplyAppointmentResult
): Promise<NextResponse> {
  const result = await executeAppointmentCommandSave(clinicId, apply);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
        ...(result.serverUpdatedAt != null
          ? { serverUpdatedAt: result.serverUpdatedAt }
          : {}),
      },
      { status: result.status, headers: APPOINTMENT_CMD_HEADERS }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      appointmentId: result.appointmentId,
      alreadyApplied: result.alreadyApplied,
      updatedAt: result.updatedAt,
      revision: result.revision,
    },
    { headers: APPOINTMENT_CMD_HEADERS }
  );
}

export async function loadClinicSnapshotForCommand(clinicId: string) {
  return getClinicDataDbWithLegacyStaff(clinicId);
}
