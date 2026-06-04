import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import {
  listPatientConsents,
  upsertPatientConsent,
  type PatientConsentType,
} from "@/lib/patient-consents.server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { getServerSession } from "@/lib/get-server-session";
import { assertClinicModule } from "@/lib/module-access.server";

async function requireStaff() {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) return null;
  return session;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const { id: patientId } = await params;
  const consents = await listPatientConsents(session.clinicId!, patientId);
  return NextResponse.json({ consents });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: {
    consentType?: PatientConsentType;
    granted?: boolean;
    documentRef?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.consentType || typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "Укажите consentType и granted" }, { status: 400 });
  }

  if (body.consentType === "egisz_transfer") {
    const denied = await assertClinicModule(session.clinicId!, "egisz");
    if (denied) return denied;
  }

  const { id: patientId } = await params;
  await upsertPatientConsent({
    clinicId: session.clinicId!,
    patientId,
    consentType: body.consentType,
    granted: body.granted,
    documentRef: body.documentRef,
    recordedBy: session.userId,
    notes: body.notes,
  });

  await writeAuditLog(
    auditFromRequest(request, {
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: "update",
      resourceType: "patient",
      resourceId: patientId,
      metadata: { consentType: body.consentType, granted: body.granted },
    })
  );

  return NextResponse.json({ ok: true });
}
