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
  canUseDayToDaySnapshotPut,
  canWriteClinicDataSync,
  filterClinicSnapshotForAccountant,
  preservePatientPhiForRedactedRoles,
  preserveServicesForReadOnlyRoles,
} from "@/lib/clinic-data-access";
import {
  enforceClinicSnapshotWritePolicy,
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

type ProtectedFieldTouch = {
  field: string;
  ids?: string[];
};

function changedOverlappingIds<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  equal?: (a: T, b: T) => boolean
): string[] {
  const isEqual = equal ?? ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const changed: string[] = [];
  for (const row of incoming) {
    const current = existingById.get(row.id);
    if (!current) continue;
    if (isEqual(current, row)) continue;
    changed.push(row.id);
    if (changed.length >= 8) break;
  }
  return changed;
}

function collectProtectedFieldTouches(
  existing: import("@/lib/clinic-persisted-state").ClinicPersistedState,
  incoming: import("@/lib/clinic-persisted-state").ClinicPersistedState
): ProtectedFieldTouch[] {
  const touches: ProtectedFieldTouch[] = [];

  if (JSON.stringify(existing.clinicSettings) !== JSON.stringify(incoming.clinicSettings)) {
    touches.push({ field: "clinicSettings" });
  }

  const serviceIds = changedOverlappingIds(existing.services, incoming.services);
  if (serviceIds.length) touches.push({ field: "services", ids: serviceIds });

  const legalIds = changedOverlappingIds(existing.legalDocuments, incoming.legalDocuments, (a, b) => {
    const aFileSize = typeof a.fileDataUrl === "string" ? a.fileDataUrl.length : 0;
    const bFileSize = typeof b.fileDataUrl === "string" ? b.fileDataUrl.length : 0;
    return (
      a.title === b.title &&
      a.category === b.category &&
      a.date === b.date &&
      (a.fileName ?? "") === (b.fileName ?? "") &&
      (a.templateUrl ?? "") === (b.templateUrl ?? "") &&
      (a.notes ?? "") === (b.notes ?? "") &&
      aFileSize === bFileSize
    );
  });
  if (legalIds.length) touches.push({ field: "legalDocuments", ids: legalIds });

  const paymentIds = changedOverlappingIds(existing.payments, incoming.payments);
  if (paymentIds.length) touches.push({ field: "payments", ids: paymentIds });

  const invoiceIds = changedOverlappingIds(existing.invoices, incoming.invoices);
  if (invoiceIds.length) touches.push({ field: "invoices", ids: invoiceIds });

  const workActIds = changedOverlappingIds(existing.workActs, incoming.workActs);
  if (workActIds.length) touches.push({ field: "workActs", ids: workActIds });

  return touches;
}

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
      : record.data;
  // Врачу не редактируем PHI в sync-снимке: пустые phone в GET → PUT затирали
  // номера для owner/admin. Скрытие телефонов — только в UI (canViewPatientPhone).

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
  if (!canUseDayToDaySnapshotPut(role)) {
    return NextResponse.json(
      {
        ok: false,
        code: "FULL_SNAPSHOT_PUT_DISABLED",
        error:
          "Полное сохранение снимка отключено для этой роли. Используйте command API из интерфейса.",
      },
      { status: 410, headers: NO_STORE_HEADERS }
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

    if (existing?.data) {
      const touches = collectProtectedFieldTouches(existing.data, parsed);
      if (touches.length > 0) {
        console.warn("[clinic/data] incoming PUT touched protected fields", {
          clinicId: session.clinicId,
          userId: session.userId,
          role,
          expectedUpdatedAt,
          expectedRevision,
          touches,
        });
      }
    }

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
    toPersist = preservePatientPhiForRedactedRoles(
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
