import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertAuthAccount } from "@/lib/auth-accounts-server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import type { UserRole } from "@/lib/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "doctor",
  "assistant",
  "accountant",
];

function requireAdminSession() {
  const cookieStore = cookies();
  return cookieStore.then((store) => {
    const session = verifySessionToken(store.get(AUTH_COOKIE)?.value);
    if (!session) return null;
    if (session.role !== "owner" && session.role !== "admin") return null;
    return session;
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (isDatabaseEnabled() && !session.clinicId) {
    return NextResponse.json({ error: "Сессия без привязки к клинике" }, { status: 403 });
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
      clinicId: session.clinicId,
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
