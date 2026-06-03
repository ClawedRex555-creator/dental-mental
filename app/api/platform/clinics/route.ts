import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { requireSuperAdminSession } from "@/lib/get-server-session";
import { listClinicsWithModules } from "@/lib/platform-modules.server";

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  try {
    const clinics = await listClinicsWithModules();
    return NextResponse.json({ clinics });
  } catch (e) {
    console.error("[platform/clinics GET]", e);
    return NextResponse.json(
      { error: "Ошибка чтения клиник из БД. Проверьте миграции (modules, egisz_config)." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: { clinicId?: string; modules?: Record<string, boolean> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.clinicId || !body.modules) {
    return NextResponse.json({ error: "Укажите clinicId и modules" }, { status: 400 });
  }

  const { updateClinicModules } = await import("@/lib/platform-modules.server");
  const { parseClinicModules } = await import("@/lib/modules");
  await updateClinicModules(body.clinicId, parseClinicModules(body.modules));
  return NextResponse.json({ ok: true });
}
