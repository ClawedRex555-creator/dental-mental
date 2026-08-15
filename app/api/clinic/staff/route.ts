import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession, type ClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { removeStaffFromClinicSnapshot } from "@/lib/clinic-data-db.server";
import { removeAuthAccountByStaffId } from "@/lib/auth-accounts-server";
import { deleteStaffDb, listStaffDb, upsertStaffDb } from "@/lib/staff-db.server";
import type { Doctor } from "@/lib/types";

async function requireStaffSession(
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

async function ensureFreshAccountSession(
  session: ClinicBoundSession
): Promise<NextResponse | null> {
  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  if (!authUser) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const dbVersion = authUser.sessionVersion ?? 0;
  if (typeof session.sessionVersion !== "number" || session.sessionVersion !== dbVersion) {
    return NextResponse.json(
      { error: "Сессия завершена: выполнен вход с другого устройства." },
      { status: 401 }
    );
  }
  return null;
}

function parseDoctor(body: unknown): Doctor | null {
  if (!body || typeof body !== "object") return null;
  const d = (body as { doctor?: unknown }).doctor;
  if (!d || typeof d !== "object") return null;
  const doc = d as Record<string, unknown>;
  if (typeof doc.id !== "string" || !doc.id.trim()) return null;
  if (typeof doc.name !== "string" || !doc.name.trim()) return null;
  if (typeof doc.specialization !== "string") return null;
  if (typeof doc.phone !== "string") return null;
  if (typeof doc.email !== "string") return null;
  if (typeof doc.cabinet !== "string") return null;
  if (typeof doc.commissionPercent !== "number") return null;
  if (typeof doc.status !== "string") return null;
  if (typeof doc.role !== "string") return null;
  return d as Doctor;
}

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ staff: null, database: false });
  }

  const sessionOrDenied = await requireStaffSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  const revoked = await ensureFreshAccountSession(session);
  if (revoked) return revoked;

  const staff = await listStaffDb(session.clinicId);
  return NextResponse.json({ staff, database: true });
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const sessionOrDenied = await requireStaffSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  const revoked = await ensureFreshAccountSession(session);
  if (revoked) return revoked;
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const doctor = parseDoctor(body);
  if (!doctor) {
    return NextResponse.json({ error: "Некорректные данные сотрудника" }, { status: 400 });
  }

  try {
    await upsertStaffDb(session.clinicId, doctor);
    return NextResponse.json({ ok: true, id: doctor.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось сохранить";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const sessionOrDenied = await requireStaffSession(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  const revoked = await ensureFreshAccountSession(session);
  if (revoked) return revoked;
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const staffId = new URL(request.url).searchParams.get("id")?.trim();
  if (!staffId) {
    return NextResponse.json({ error: "Укажите id сотрудника" }, { status: 400 });
  }

  try {
    try {
      await removeStaffFromClinicSnapshot(session.clinicId, staffId);
    } catch (snapErr) {
      const message =
        snapErr instanceof Error ? snapErr.message : "Ошибка обновления снимка клиники";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    // Сначала учётка: иначе логин остаётся в auth_users и «уже зарегистрирован».
    try {
      await removeAuthAccountByStaffId(staffId, session.clinicId);
    } catch (authErr) {
      const message =
        authErr instanceof Error ? authErr.message : "Не удалось удалить учётную запись";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    await deleteStaffDb(session.clinicId, staffId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось удалить";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
