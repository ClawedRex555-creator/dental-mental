import { NextResponse } from "next/server";

/** Mobile API health — не требует авторизации */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "emkaro-mobile-api",
    version: "v1",
  });
}
