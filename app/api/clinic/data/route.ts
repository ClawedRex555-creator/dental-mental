import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession, type ClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import {
  CLINIC_DATA_SCHEMA_VERSION,
  parseClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  getClinicDataDbWithLegacyStaff,
  PatientMassLossGuardError,
  ScheduleMassLossGuardError,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import {
  canReadClinicDataSync,
  canWriteClinicDataSync,
  filterClinicSnapshotForAccountant,
  preserveServicesForReadOnlyRoles,
} from "@/lib/clinic-data-access";
import {
  enforceClinicSnapshotWritePolicy,
  filterClinicSnapshotForDoctor,
} from "@/lib/clinic-snapshot-write-policy";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { isModuleEnabled } from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";

const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, must-revalidate",
  Vary: "Cookie",
};

function isSessionRevokedForAccount(
  session: ClinicBoundSession,
  authUser: Awaited<ReturnType<typeof findAuthUserByUserIdDb>>
): boolean {
  if (!authUser) return false;
  const dbVersion = authUser.sessionVersion ?? 0;
  return typeof session.sessionVersion !== "number" || session.sessionVersion !== dbVersion;
}

async function requireClinicSession(
  request: Request
): Promise<NextResponse | ClinicBoundSession> {
  const store = await cookies();
  const session = asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;
  return session;
}

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json(
      { data: null, database: false },
      { headers: NO_STORE_HEADERS }
    );
  }

  const sessionOrDenied = await requireClinicSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  if (isSessionRevokedForAccount(session, authUser)) {
    return NextResponse.json(
      { error: "Сессия завершена: выполнен вход с другого устройства." },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const role = authUser?.role ?? session.role;
  if (!authUser || !canReadClinicDataSync(role)) {
    return NextResponse.json(
      { error: "Нет доступа к данным клиники" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const metaOnly = new URL(request.url).searchParams.get("meta") === "1";

  const record = await getClinicDataDbWithLegacyStaff(session.clinicId);
  if (!record) {
    return NextResponse.json({
      data: metaOnly ? undefined : null,
      database: true,
      version: CLINIC_DATA_SCHEMA_VERSION,
      updatedAt: null,
    }, { headers: NO_STORE_HEADERS });
  }

  if (metaOnly) {
    return NextResponse.json({
      database: true,
      updatedAt: record.updatedAt,
      version: record.version,
      revision: record.revision,
    }, { headers: NO_STORE_HEADERS });
  }

  const data =
    role === "accountant"
      ? filterClinicSnapshotForAccountant(record.data)
      : role === "doctor"
        ? filterClinicSnapshotForDoctor(record.data)
        : record.data;

  return NextResponse.json({
    data,
    updatedAt: record.updatedAt,
    version: record.version,
    revision: record.revision,
    database: true,
  }, { headers: NO_STORE_HEADERS });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Запрос отклонён" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json(
      { ok: false, error: "База данных не настроена" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const sessionOrDenied = await requireClinicSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;

  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  if (isSessionRevokedForAccount(session, authUser)) {
    return NextResponse.json(
      { ok: false, error: "Сессия завершена: выполнен вход с другого устройства." },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const role = authUser?.role ?? session.role;
  if (!authUser || !canWriteClinicDataSync(role)) {
    return NextResponse.json(
      { ok: false, error: "Сохранение данных доступно владельцу, администратору, врачу и ассистенту" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Слишком большой объём данных" },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  let body: {
    data?: unknown;
    expectedUpdatedAt?: unknown;
    expectedRevision?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = parseClinicPersistedState(body.data);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "Некорректные данные клиники" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt.trim()
        ? body.expectedUpdatedAt
        : null;
    const expectedRevision =
      typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
        ? Math.max(0, Math.floor(body.expectedRevision))
        : typeof body.expectedRevision === "string" &&
            body.expectedRevision.trim() &&
            Number.isFinite(Number(body.expectedRevision))
          ? Math.max(0, Math.floor(Number(body.expectedRevision)))
          : null;

    // Hard guard: never accept writes from tabs that do not carry
    // a sync baseline when snapshot already exists on server.
    if (existing?.data && !expectedUpdatedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "STALE_BASELINE_REQUIRED",
          error:
            "Вкладка работает со старыми данными. Обновите страницу и повторите действие.",
          serverUpdatedAt: existing.updatedAt,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    let toPersist = parsed;
    toPersist = preserveServicesForReadOnlyRoles(
      role,
      toPersist,
      existing?.data ?? null
    );
    const policy = enforceClinicSnapshotWritePolicy(
      role,
      existing?.data ?? null,
      toPersist
    );
    if (!policy.ok) {
      return NextResponse.json(
        { ok: false, error: policy.error },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    toPersist = policy.data;

    const saved = await saveClinicDataDb(session.clinicId, toPersist, {
      expectedUpdatedAt,
      expectedRevision,
      autoMergeOnVersionConflict: true,
    });

    if (existing?.data) {
      const modules = await getClinicModules(session.clinicId);
      if (isModuleEnabled(modules, "egisz")) {
        const { maybeAutoQueueMedicalRecords, maybeAutoQueuePaidWorkActs } =
          await import("@/lib/egisz/queue.server");
        await maybeAutoQueueMedicalRecords(
          session.clinicId,
          existing.data.medicalRecords,
          saved.data.medicalRecords,
          saved.data
        ).catch(() => undefined);
        await maybeAutoQueuePaidWorkActs(session.clinicId, existing.data, saved.data).catch(
          () => undefined
        );
      }
      if (isModuleEnabled(modules, "notifications")) {
        const { maybeSyncAppointmentNotifications, maybeNotifyClinicStaffEvents } = await import(
          "@/lib/notifications/worker.server"
        );
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
    }

    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt,
      version: saved.version,
      revision: saved.revision,
      merged: saved.mergedOnConflict,
    }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    if (e instanceof PatientMassLossGuardError) {
      return NextResponse.json(
        {
          ok: false,
          code: e.code,
          error:
            "Обнаружена попытка массового удаления пациентов из устаревшей вкладки. Обновите страницу и повторите действие.",
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    if (e instanceof ScheduleMassLossGuardError) {
      return NextResponse.json(
        {
          ok: false,
          code: e.code,
          error:
            "Обнаружена попытка массового изменения расписания из устаревшей вкладки. Обновите страницу и повторите действие.",
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[clinic/data] save failed", e);
    return NextResponse.json(
      { ok: false, error: "Не удалось сохранить данные" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
