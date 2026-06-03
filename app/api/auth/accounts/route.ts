import { NextResponse } from "next/server";
import {
  removeAuthAccountByStaffId,
  updateAuthAccountProfile,
  upsertAuthAccount,
} from "@/lib/auth-accounts-server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";
import type { UserRole } from "@/lib/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "doctor",
  "assistant",
  "accountant",
];

async function requireAdminSession() {
  const session = await getServerSession();
  if (!session) return null;
  if (session.role !== "owner" && session.role !== "admin") return null;
  return session;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function resolveClinicId(request: Request, session: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>>) {
  if (!isDatabaseEnabled()) return session.clinicId ?? null;
  return resolveClinicIdForSession(session, request.headers.get("host"));
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const clinicId = await resolveClinicId(request, session);
  if (isDatabaseEnabled() && !clinicId) {
    return NextResponse.json(
      { error: "Не удалось определить клинику. Выйдите и войдите снова на поддомене клиники." },
      { status: 403 }
    );
  }

  let body: {
    id?: string;
    login?: string;
    password?: string;
    role?: UserRole;
    name?: string;
    staffId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim();
  const role = body.role;
  const id = body.id?.trim();

  if (!id || !login || !password || !name || !role) {
    return NextResponse.json({ error: "Заполните все поля учётной записи" }, { status: 400 });
  }
  if (!isValidEmail(login)) {
    return NextResponse.json({ error: "Некорректный email для входа" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Пароль не менее 8 символов" }, { status: 400 });
  }
  if (role === "owner") {
    return NextResponse.json(
      { error: "Роль владельца нельзя создать через API" },
      { status: 403 }
    );
  }
  if (session.role === "admin" && role === "admin") {
    return NextResponse.json(
      { error: "Администратор не может создавать других администраторов" },
      { status: 403 }
    );
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Недопустимая роль" }, { status: 400 });
  }

  try {
    const record = await upsertAuthAccount({
      id,
      clinicId: clinicId ?? undefined,
      login,
      password,
      role,
      name,
      staffId: body.staffId,
    });
    return NextResponse.json({ ok: true, login: record.login });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось создать учётную запись";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Сброс пароля / выдача доступа существующему сотруднику */
export async function PATCH(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const clinicId = await resolveClinicId(request, session);
  if (isDatabaseEnabled() && !clinicId) {
    return NextResponse.json(
      { error: "Не удалось определить клинику. Выйдите и войдите снова." },
      { status: 403 }
    );
  }

  let body: {
    staffId?: string;
    login?: string;
    password?: string;
    role?: UserRole;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const staffId = body.staffId?.trim();
  const login = body.login?.trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim();
  const role = body.role;

  if (!staffId || !login || !name || !role) {
    return NextResponse.json({ error: "Заполните staffId, login, name, role" }, { status: 400 });
  }
  if (!isValidEmail(login)) {
    return NextResponse.json({ error: "Некорректный email для входа" }, { status: 400 });
  }
  if (role === "owner" || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Недопустимая роль" }, { status: 400 });
  }
  if (session.role === "admin" && role === "admin") {
    return NextResponse.json(
      { error: "Администратор не может назначать роль администратора" },
      { status: 403 }
    );
  }

  try {
    if (password.length > 0) {
      if (password.length < 8) {
        return NextResponse.json({ error: "Пароль не менее 8 символов" }, { status: 400 });
      }
      const record = await upsertAuthAccount({
        id: `auth-${staffId}`,
        clinicId: clinicId ?? undefined,
        login,
        password,
        role,
        name,
        staffId,
      });
      return NextResponse.json({ ok: true, login: record.login });
    }

    const record = await updateAuthAccountProfile({
      clinicId: clinicId ?? undefined,
      staffId,
      login,
      role,
      name,
    });
    return NextResponse.json({ ok: true, login: record.login });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось обновить учётную запись";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Увольнение: удалить учётку для входа по staffId */
export async function DELETE(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const clinicId = await resolveClinicId(request, session);
  if (isDatabaseEnabled() && !clinicId) {
    return NextResponse.json(
      { error: "Не удалось определить клинику. Выйдите и войдите снова." },
      { status: 403 }
    );
  }

  const staffId = new URL(request.url).searchParams.get("staffId")?.trim();
  if (!staffId) {
    return NextResponse.json({ error: "Укажите staffId" }, { status: 400 });
  }

  try {
    await removeAuthAccountByStaffId(staffId, clinicId ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось удалить учётную запись";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
