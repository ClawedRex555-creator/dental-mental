import { NextResponse } from "next/server";
import { findAccountByLogin, verifyAccountPassword } from "@/lib/auth-accounts-server";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth-session";

export async function POST(request: Request) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const login = body.login?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!login || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const account = findAccountByLogin(login);
  if (!account || !verifyAccountPassword(account, password)) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const token = createSessionToken({
    userId: account.id,
    staffId: account.staffId,
    role: account.role,
    name: account.name,
    email: account.login,
  });

  const res = NextResponse.json({
    user: {
      id: account.id,
      name: account.name,
      email: account.login,
      role: account.role,
      staffId: account.staffId,
      status: "active" as const,
    },
  });

  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
