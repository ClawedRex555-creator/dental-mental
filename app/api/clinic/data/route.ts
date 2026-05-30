import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import {
  CLINIC_DATA_SCHEMA_VERSION,
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";

const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;

function requireClinicSession() {
  return cookies().then((store) => {
    const session = verifySessionToken(store.get(AUTH_COOKIE)?.value);
    if (!session?.clinicId) return null;
    return session;
  });
}

export async function GET() {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ data: null, database: false });
  }

  const session = await requireClinicSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
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

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Слишком большой объём данных" }, { status: 413 });
  }

  let body: { data?: unknown };
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
    const saved = await saveClinicDataDb(session.clinicId, parsed);
    return NextResponse.json({
      ok: true,
      updatedAt: saved.updatedAt,
      version: saved.version,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось сохранить";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
