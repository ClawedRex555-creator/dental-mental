import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { verifySameOrigin } from "@/lib/csrf-origin";
import {
  listPatientConsents,
  upsertPatientConsent,
  type PatientConsentType,
} from "@/lib/patient-consents.server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { getServerSession } from "@/lib/get-server-session";
import type { SessionPayload } from "@/lib/auth-session";

type StaffSession = SessionPayload & { clinicId: string };

async function requireStaff(request: Request): Promise<NextResponse | StaffSession> {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;
  return { ...session, clinicId: session.clinicId };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionOrDenied = await requireStaff(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;
  const { id: patientId } = await params;
  const consents = await listPatientConsents(session.clinicId, patientId);
  return NextResponse.json({ consents });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const sessionOrDenied = await requireStaff(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;

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

  const { id: patientId } = await params;
  await upsertPatientConsent({
    clinicId: session.clinicId,
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
