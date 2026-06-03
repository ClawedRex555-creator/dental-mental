import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { processEgiszSubmission, queueEgiszSubmission, getEgiszSubmissionById } from "@/lib/egisz/db.server";
import { queueMedicalRecordEgisz } from "@/lib/egisz/queue.server";
import { getServerSession } from "@/lib/get-server-session";
import type { EgiszDocumentType } from "@/lib/egisz/types";

async function requireStaff(request: Request) {
  const session = await getServerSession();
  if (!session || session.isSuperAdmin) return null;
  const clinicId = await resolveClinicIdForSession(session, request.headers.get("host"));
  if (!clinicId) return null;
  return { session, clinicId };
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const ctx = await requireStaff(request);
  if (!ctx) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (ctx.session.role !== "owner" && ctx.session.role !== "admin" && ctx.session.role !== "doctor") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: {
    medicalRecordId?: string;
    patientId?: string;
    submissionId?: string;
    documentType?: EgiszDocumentType;
    process?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (body.submissionId) {
    const submission = await getEgiszSubmissionById(body.submissionId, ctx.clinicId);
    if (!submission) {
      return NextResponse.json({ error: "Отправка не найдена" }, { status: 404 });
    }
    await processEgiszSubmission(body.submissionId, ctx.clinicId);
    return NextResponse.json({ ok: true, submissionId: body.submissionId });
  }

  if (body.medicalRecordId) {
    const { submissionId, skipped } = await queueMedicalRecordEgisz({
      clinicId: ctx.clinicId,
      medicalRecordId: body.medicalRecordId,
      documentType: body.documentType,
    });
    if (!submissionId) {
      return NextResponse.json({ error: skipped ?? "Не удалось поставить в очередь" }, { status: 400 });
    }
    if (body.process !== false) {
      await processEgiszSubmission(submissionId);
    }
    return NextResponse.json({ ok: true, submissionId });
  }

  if (body.patientId) {
    const submissionId = await queueEgiszSubmission({
      clinicId: ctx.clinicId,
      patientId: body.patientId,
      documentType: body.documentType ?? "patient_registration",
      payload: {},
    });
    if (!submissionId) {
      return NextResponse.json({ error: "Не удалось поставить в очередь" }, { status: 500 });
    }
    if (body.process !== false) {
      await processEgiszSubmission(submissionId);
    }
    return NextResponse.json({ ok: true, submissionId });
  }

  return NextResponse.json({ error: "Укажите medicalRecordId или patientId" }, { status: 400 });
}
