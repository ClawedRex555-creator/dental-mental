import { NextResponse } from "next/server";
import { AUTH_COOKIE, sessionCookieOptions } from "@/lib/auth-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
  return res;
}
