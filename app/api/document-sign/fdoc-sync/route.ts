import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { syncFdocPackageStatus, syncPendingFdocPackages } from "@/lib/document-sign/fdoc/webhook.server";
import { getDocumentSignRequestById } from "@/lib/document-sign/requests.server";
import { isFdocConfigured } from "@/lib/document-sign/fdoc/config.server";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";

/**
 * Синхронизация статуса F.Doc.
 * POST {} — опрос всех pending (для cron)
 * POST { requestId } — один пакет (для UI)
 */
export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  if (!isFdocConfigured()) {
    return NextResponse.json({ error: "F.Doc не настроен" }, { status: 503 });
  }

  const cronSecret = process.env.FDOC_CRON_SECRET?.trim() || process.env.EGISZ_CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  let body: { requestId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const isCron = Boolean(cronSecret && authHeader === cronSecret);

  if (!isCron) {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
    }
    const session = await getServerSession();
    if (!session?.clinicId || session.isSuperAdmin) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }
    const hostDenied = assertClinicHost(session, request);
    if (hostDenied) return hostDenied;

    if (body.requestId?.trim()) {
      const record = await getDocumentSignRequestById(session.clinicId, body.requestId.trim());
      if (!record) {
        return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
      }
      const result = await syncFdocPackageStatus(record);
      return NextResponse.json({ ok: true, updated: result.updated, error: result.error });
    }
  }

  const batch = await syncPendingFdocPackages();
  return NextResponse.json({ ok: true, ...batch });
}
