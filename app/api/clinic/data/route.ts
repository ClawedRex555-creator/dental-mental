import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession, type ClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import {
  CLINIC_DATA_SCHEMA_VERSION,
  mergeClinicDataForSave,
  mergeClinicDataOnWriteConflict,
  parseClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import {
  canReadClinicDataSync,
  canWriteClinicDataSync,
  filterClinicSnapshotForAccountant,
  preserveServicesForReadOnlyRoles,
} from "@/lib/clinic-data-access";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { isModuleEnabled } from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";

const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;

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
    return NextResponse.json({ data: null, database: false });
  }

  const sessionOrDenied = await requireClinicSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  if (!canReadClinicDataSync(session.role)) {
    return NextResponse.json(
      { error: "Нет доступа к данным клиники" },
      { status: 403 }
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
    });
  }

  if (metaOnly) {
    return NextResponse.json({
      database: true,
      updatedAt: record.updatedAt,
      version: record.version,
    });
  }

  const data =
    session.role === "accountant"
      ? filterClinicSnapshotForAccountant(record.data)
      : record.data;

  return NextResponse.json({
    data,
    updatedAt: record.updatedAt,
    version: record.version,
    database: true,
  });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Запрос отклонён" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ ok: false, error: "База данных не настроена" }, { status: 503 });
  }

  const sessionOrDenied = await requireClinicSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;

  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  const role = authUser?.role ?? session.role;
  if (!canWriteClinicDataSync(role)) {
    return NextResponse.json(
      { ok: false, error: "Сохранение данных доступно владельцу, администратору, врачу и ассистенту" },
      { status: 403 }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Слишком большой объём данных" }, { status: 413 });
  }

  let body: { data?: unknown; expectedUpdatedAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Неверный запрос" }, { status: 400 });
  }

  const parsed = parseClinicPersistedState(body.data);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Некорректные данные клиники" }, { status: 400 });
  }

  try {
    const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
    let toPersist = parsed;
    let mergedConflict = false;
    if (
      existing?.data &&
      body.expectedUpdatedAt &&
      existing.updatedAt > body.expectedUpdatedAt
    ) {
      toPersist = mergeClinicDataOnWriteConflict(existing.data, parsed);
      mergedConflict = true;
    }
    toPersist = preserveServicesForReadOnlyRoles(
      role,
      toPersist,
      existing?.data ?? null
    );

    const saved = await saveClinicDataDb(session.clinicId, toPersist);

    if (existing?.data) {
      const modules = await getClinicModules(session.clinicId);
      if (isModuleEnabled(modules, "egisz")) {
        const { maybeAutoQueueMedicalRecords, maybeAutoQueuePaidWorkActs } =
          await import("@/lib/egisz/queue.server");
        await maybeAutoQueueMedicalRecords(
          session.clinicId,
          existing.data.medicalRecords,
          toPersist.medicalRecords,
          toPersist
        ).catch(() => undefined);
        await maybeAutoQueuePaidWorkActs(session.clinicId, existing.data, toPersist).catch(
          () => undefined
        );
      }
      if (isModuleEnabled(modules, "notifications")) {
        const { maybeSyncAppointmentNotifications } = await import(
          "@/lib/notifications/worker.server"
        );
        await maybeSyncAppointmentNotifications(
          session.clinicId,
          existing.data.appointments,
          toPersist.appointments
        ).catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt,
      version: saved.version,
      merged: mergedConflict,
    });
  } catch (e) {
    console.error("[clinic/data] save failed", e);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить данные" }, { status: 500 });
  }
}
