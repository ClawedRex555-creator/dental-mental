import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { getServerSession } from "@/lib/get-server-session";
import { getClinicDataDb, saveClinicDataDb } from "@/lib/clinic-data-db.server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { isPhiEncryptionEnabled } from "@/lib/phi-crypto.server";
import { isDatabaseEnabled } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    phiEncryption: isPhiEncryptionEnabled(),
    database: isDatabaseEnabled(),
    auditLogEnabled: isDatabaseEnabled(),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET?.trim()),
    csrfProtection: true,
    httpOnlyCookies: true,
    checklist: [
      {
        id: "phi",
        label: "Шифрование ПДн пациентов (PHI_ENCRYPTION_KEY)",
        done: isPhiEncryptionEnabled(),
      },
      {
        id: "audit",
        label: "Журнал доступа к персональным данным",
        done: isDatabaseEnabled(),
      },
      {
        id: "consents",
        label: "Учёт согласий пациентов",
        done: isDatabaseEnabled(),
      },
      {
        id: "auth",
        label: "Секрет сессии (AUTH_SECRET)",
        done: Boolean(process.env.AUTH_SECRET?.trim()),
      },
    ],
  });
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: { patientId?: string; action?: "export" | "anonymize" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.patientId || !body.action) {
    return NextResponse.json({ error: "Укажите patientId и action" }, { status: 400 });
  }

  const record = await getClinicDataDb(session.clinicId);
  if (!record) {
    return NextResponse.json({ error: "Данные клиники не найдены" }, { status: 404 });
  }
  const snapshot = record.data;

  const patient = snapshot.patients.find((p) => p.id === body.patientId);
  if (!patient) {
    return NextResponse.json({ error: "Пациент не найден" }, { status: 404 });
  }

  if (body.action === "export") {
    const exportData = {
      exportedAt: new Date().toISOString(),
      patient,
      appointments: snapshot.appointments.filter((a) => a.patientId === body.patientId),
      medicalRecords: snapshot.medicalRecords.filter((r) => r.patientId === body.patientId),
      treatmentPlans: snapshot.treatmentPlans.filter((p) => p.patientId === body.patientId),
      payments: snapshot.payments.filter((p) => p.patientId === body.patientId),
      workActs: snapshot.workActs.filter((a) => a.patientId === body.patientId),
    };

    await writeAuditLog(
      auditFromRequest(request, {
        clinicId: session.clinicId,
        userId: session.userId,
        userName: session.name,
        userRole: session.role,
        action: "export",
        resourceType: "patient",
        resourceId: body.patientId,
      })
    );

    return NextResponse.json({ export: exportData });
  }

  if (body.action === "anonymize") {
    const anonymized = snapshot.patients.map((p) =>
      p.id === body.patientId
        ? {
            ...p,
            firstName: "Удалён",
            lastName: "Пациент",
            middleName: undefined,
            phone: "",
            email: "",
            address: "",
            snils: "",
            passportSeries: "",
            passportNumber: "",
            notes: "[данные обезличены по запросу]",
            status: "archived" as const,
          }
        : p
    );

    await saveClinicDataDb(session.clinicId, {
      ...snapshot,
      patients: anonymized,
    });

    await writeAuditLog(
      auditFromRequest(request, {
        clinicId: session.clinicId,
        userId: session.userId,
        userName: session.name,
        userRole: session.role,
        action: "delete",
        resourceType: "patient",
        resourceId: body.patientId,
        metadata: { mode: "anonymize" },
      })
    );

    return NextResponse.json({ ok: true, message: "Данные пациента обезличены" });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
