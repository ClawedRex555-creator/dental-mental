import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { applySubmitWorkActToPersistedState } from "@/lib/apply-submit-work-act";
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
import { isModuleEnabled } from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";
import type { WorkAct } from "@/lib/types";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, must-revalidate",
  Vary: "Cookie",
};

function isWorkActBody(value: unknown): value is WorkAct {
  if (!value || typeof value !== "object") return false;
  const act = value as Partial<WorkAct>;
  return typeof act.id === "string" && act.id.trim().length > 0;
}

/**
 * Command API: отправка акта администратору (ready_for_payment)
 * без полного client PUT + autoMerge (иначе статус откатается).
 */
export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Запрос отклонён" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json(
      { ok: false, error: "База данных недоступна" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const store = await cookies();
  const session = asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  const role = authUser?.role ?? session.role;
  if (!authUser || !canWriteClinicDataSync(role)) {
    return NextResponse.json(
      { ok: false, error: "Нет прав на отправку акта" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: { act?: unknown; appointmentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!isWorkActBody(body.act)) {
    return NextResponse.json(
      { ok: false, error: "Не указан акт" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const appointmentId =
    typeof body.appointmentId === "string" && body.appointmentId.trim()
      ? body.appointmentId.trim()
      : body.act.appointmentId;

  const maxAttempts = 3;
  let lastConflictUpdatedAt: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
    if (!existing?.data) {
      return NextResponse.json(
        { ok: false, error: "Нет данных клиники" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const applied = applySubmitWorkActToPersistedState(existing.data, body.act, {
      appointmentId,
    });
    if (!applied.ok) {
      return NextResponse.json(
        { ok: false, error: applied.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (applied.alreadyApplied) {
      return NextResponse.json(
        {
          ok: true,
          actId: applied.actId,
          appointmentId: applied.appointmentId,
          alreadyApplied: true,
          updatedAt: existing.updatedAt,
          revision: existing.revision,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    try {
      const saved = await saveClinicDataDb(session.clinicId, applied.state, {
        expectedUpdatedAt: existing.updatedAt,
        expectedRevision: existing.revision,
        autoMergeOnVersionConflict: false,
        replaceAppliedSnapshot: true,
      });

      const modules = await getClinicModules(session.clinicId);
      if (isModuleEnabled(modules, "notifications")) {
        const { maybeSyncAppointmentNotifications, maybeNotifyClinicStaffEvents } =
          await import("@/lib/notifications/worker.server");
        await maybeSyncAppointmentNotifications(
          session.clinicId,
          existing.data.appointments,
          saved.data.appointments
        ).catch(() => undefined);
        await maybeNotifyClinicStaffEvents({
          clinicId: session.clinicId,
          prevSnapshot: existing.data,
          nextSnapshot: saved.data,
        }).catch(() => undefined);
      }

      return NextResponse.json(
        {
          ok: true,
          actId: applied.actId,
          appointmentId: applied.appointmentId,
          alreadyApplied: false,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      if (e instanceof ClinicRevisionConflictError) {
        lastConflictUpdatedAt = e.serverUpdatedAt;
        if (attempt < maxAttempts - 1) continue;
        return NextResponse.json(
          {
            ok: false,
            error: "Конфликт версии — обновите данные и повторите",
            code: e.code,
            serverUpdatedAt: e.serverUpdatedAt,
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof PatientMassLossGuardError || e instanceof ScheduleMassLossGuardError) {
        return NextResponse.json(
          { ok: false, error: e.message, code: e.code },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      const msg = e instanceof Error ? e.message : "Не удалось отправить акт";
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Конфликт версии — обновите данные и повторите",
      code: "REVISION_CONFLICT",
      serverUpdatedAt: lastConflictUpdatedAt,
    },
    { status: 409, headers: NO_STORE_HEADERS }
  );
}
