import { NextResponse } from "next/server";
import {
  getPlatformEgiszSettings,
  listClinicEgiszSummaries,
} from "@/lib/egisz/platform.server";
import { requireSuperAdminSession } from "@/lib/get-server-session";

/** Сводка ЕГИСЗ по всем клиникам (multi-tenant). */
export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  try {
    const [platform, clinics] = await Promise.all([
      Promise.resolve(getPlatformEgiszSettings()),
      listClinicEgiszSummaries(),
    ]);
    return NextResponse.json({ platform, clinics });
  } catch (e) {
    console.error("[platform/egisz GET]", e);
    return NextResponse.json({ error: "Ошибка чтения сводки ЕГИСЗ" }, { status: 500 });
  }
}
