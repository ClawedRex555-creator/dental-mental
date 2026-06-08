import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { removeStaffFromClinicSnapshot } from "@/lib/clinic-data-db.server";
import { deleteStaffDb, listStaffDb, upsertStaffDb } from "@/lib/staff-db.server";
import type { Doctor } from "@/lib/types";

async function requireStaffSession() {
  const store = await cookies();
  return asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
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

export async function GET() {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ staff: null, database: false });
  }

  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

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

  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
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

  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
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
    await deleteStaffDb(session.clinicId, staffId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось удалить";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
