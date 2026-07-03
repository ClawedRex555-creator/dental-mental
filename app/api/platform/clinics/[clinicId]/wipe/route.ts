import { NextResponse } from "next/server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { requireSuperAdminSession } from "@/lib/get-server-session";
import {
  getClinicMetaForWipe,
  wipeClinicDataWithBackup,
} from "@/lib/platform-clinic-wipe.server";

export async function POST(
  request: Request,
  context: { params: Promise<{ clinicId: string }> }
) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { clinicId } = await context.params;

  let body: { confirmSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  try {
    const clinic = await getClinicMetaForWipe(clinicId);
    const confirmSlug = body.confirmSlug?.trim().toLowerCase();
    if (!confirmSlug || confirmSlug !== clinic.slug) {
      return NextResponse.json(
        { error: `Введите slug клиники для подтверждения: ${clinic.slug}` },
        { status: 400 }
      );
    }

    const result = await wipeClinicDataWithBackup(clinicId);

    await writeAuditLog(
      auditFromRequest(request, {
        clinicId,
        userId: session.userId,
        userName: session.name ?? "superadmin",
        userRole: "superadmin",
        action: "delete",
        resourceType: "settings",
        resourceId: clinicId,
        metadata: {
          kind: "clinic_wipe",
          backupFile: result.backupFileName,
        },
      })
    );

    return NextResponse.json({
      ok: true,
      backupFileName: result.backupFileName,
      backupPath: result.backupPath,
      clinicSlug: result.clinicSlug,
      clinicName: result.clinicName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка очистки данных клиники";
    console.error("[platform/clinics/wipe]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
