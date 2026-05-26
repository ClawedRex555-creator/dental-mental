import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertAuthAccount } from "@/lib/auth-accounts-server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import type { UserRole } from "@/lib/types";

function requireAdminSession() {
  const cookieStore = cookies();
  return cookieStore.then((store) => {
    const session = verifySessionToken(store.get(AUTH_COOKIE)?.value);
    if (!session) return null;
    if (session.role !== "owner" && session.role !== "admin") return null;
    return session;
  });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
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

  const login = body.login?.trim();
  const password = body.password ?? "";
  const name = body.name?.trim();
  const role = body.role;
  const id = body.id?.trim();

  if (!id || !login || !password || !name || !role) {
    return NextResponse.json({ error: "Заполните все поля учётной записи" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Пароль не менее 6 символов" }, { status: 400 });
  }

  try {
    const record = upsertAuthAccount({
      id,
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
