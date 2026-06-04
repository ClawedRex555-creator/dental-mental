import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getEgiszConfig, listEgiszSubmissions, queueEgiszSubmission } from "@/lib/egisz/db.server";
import type { EgiszDocumentType } from "@/lib/egisz/types";
import { getServerSession } from "@/lib/get-server-session";
import { assertClinicModule } from "@/lib/module-access.server";

async function requireClinicAdmin(request: Request) {
  const session = await getServerSession();
  if (!session || session.isSuperAdmin) return null;
  if (session.role !== "owner" && session.role !== "admin") return null;
  const clinicId = await resolveClinicIdForSession(session, request.headers.get("host"));
  if (!clinicId) return null;
  return { session, clinicId };
}

export async function GET(request: Request) {
  const ctx = await requireClinicAdmin(request);
  if (!ctx) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const denied = await assertClinicModule(ctx.clinicId, "egisz");
  if (denied) return denied;
  const submissions = await listEgiszSubmissions(ctx.clinicId);
  return NextResponse.json({ submissions });
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const ctx = await requireClinicAdmin(request);
  if (!ctx) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const deniedPost = await assertClinicModule(ctx.clinicId, "egisz");
  if (deniedPost) return deniedPost;

  let body: {
    patientId?: string;
    medicalRecordId?: string;
    documentType?: EgiszDocumentType;
    payload?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.patientId || !body.documentType) {
    return NextResponse.json({ error: "Укажите patientId и documentType" }, { status: 400 });
  }

  const config = await getEgiszConfig(ctx.clinicId);
  if (!config.enabled) {
    return NextResponse.json({ error: "ЕГИСЗ отключён в настройках" }, { status: 400 });
  }

  const id = await queueEgiszSubmission({
    clinicId: ctx.clinicId,
    patientId: body.patientId,
    medicalRecordId: body.medicalRecordId,
    documentType: body.documentType,
    payload: body.payload ?? {},
  });

  return NextResponse.json({ ok: true, submissionId: id });
}
