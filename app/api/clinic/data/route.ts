import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";
import {
  CLINIC_DATA_SCHEMA_VERSION,
  mergeClinicDataForSave,
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import {
  canReadClinicDataSync,
  canWriteClinicDataSync,
} from "@/lib/clinic-data-access";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { isModuleEnabled } from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";

const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;

async function requireClinicSession() {
  const store = await cookies();
  return asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
}

export async function GET() {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ data: null, database: false });
  }

  const session = await requireClinicSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (!canReadClinicDataSync(session.role)) {
    return NextResponse.json(
      { error: "Нет доступа к данным клиники" },
      { status: 403 }
    );
  }

  const record = await getClinicDataDbWithLegacyStaff(session.clinicId);
  if (!record) {
    return NextResponse.json({ data: null, database: true, version: CLINIC_DATA_SCHEMA_VERSION });
  }

  return NextResponse.json({
    data: record.data,
    updatedAt: record.updatedAt,
    version: record.version,
    database: true,
  });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const session = await requireClinicSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (!canWriteClinicDataSync(session.role)) {
    return NextResponse.json(
      { error: "Сохранение данных доступно владельцу, администратору, врачу и ассистенту" },
      { status: 403 }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Слишком большой объём данных" }, { status: 413 });
  }

  let body: { data?: unknown; expectedUpdatedAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const parsed = parseClinicPersistedState(body.data);
  if (!parsed) {
    return NextResponse.json({ error: "Некорректные данные клиники" }, { status: 400 });
  }

  try {
    const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
    let toPersist = parsed;
    if (
      existing?.data &&
      body.expectedUpdatedAt &&
      existing.updatedAt > body.expectedUpdatedAt
    ) {
      toPersist = mergeClinicDataForSave(existing.data, parsed);
    }
    const saved = await saveClinicDataDb(session.clinicId, toPersist);

    if (existing?.data.medicalRecords) {
      const modules = await getClinicModules(session.clinicId);
      if (isModuleEnabled(modules, "egisz")) {
        const { maybeAutoQueueMedicalRecords } = await import("@/lib/egisz/queue.server");
        await maybeAutoQueueMedicalRecords(
          session.clinicId,
          existing.data.medicalRecords,
          toPersist.medicalRecords
        ).catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt,
      version: saved.version,
    });
  } catch (e) {
    console.error("[clinic/data] save failed", e);
    return NextResponse.json({ error: "Не удалось сохранить данные" }, { status: 500 });
  }
}
