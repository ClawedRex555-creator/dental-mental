import "server-only";

import { getEgiszConfig, queueEgiszSubmission } from "@/lib/egisz/db.server";
import { buildDentalSemdDraft } from "@/lib/egisz/export";
import type { EgiszDocumentType } from "@/lib/egisz/types";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { getPatientEgiszTransferConsentStatus } from "@/lib/patient-consents.server";
import type { MedicalRecord, Patient } from "@/lib/types";

function requiresEgiszTransferConsent(config: Awaited<ReturnType<typeof getEgiszConfig>>): boolean {
  return Boolean(config.enabled && config.connectionMode === "live");
}

export async function queueMedicalRecordEgisz(input: {
  clinicId: string;
  medicalRecordId: string;
  documentType?: EgiszDocumentType;
}): Promise<{ submissionId: string | null; skipped?: string }> {
  const config = await getEgiszConfig(input.clinicId);
  if (!config.enabled) {
    return { submissionId: null, skipped: "ЕГИСЗ отключён" };
  }

  const snapshot = await getClinicDataDb(input.clinicId);
  if (!snapshot) return { submissionId: null, skipped: "Нет данных клиники" };

  const record = snapshot.data.medicalRecords.find((r) => r.id === input.medicalRecordId);
  if (!record) return { submissionId: null, skipped: "Медкарта не найдена" };

  const patient = snapshot.data.patients.find((p) => p.id === record.patientId);
  if (!patient) return { submissionId: null, skipped: "Пациент не найден" };

  if (requiresEgiszTransferConsent(config)) {
    const consentStatus = await getPatientEgiszTransferConsentStatus(
      input.clinicId,
      record.patientId
    );
    if (consentStatus !== "granted") {
      return {
        submissionId: null,
        skipped:
          consentStatus === "refused"
            ? "Пациент отказался от передачи в ЕГИСЗ"
            : "Нет согласия на передачу в ЕГИСЗ — оформите документы при статусе «Пришёл»",
      };
    }
  }

  const draft = buildDentalSemdDraft(
    patient,
    record,
    config.organizationOid
  );

  const submissionId = await queueEgiszSubmission({
    clinicId: input.clinicId,
    patientId: record.patientId,
    medicalRecordId: record.id,
    documentType: input.documentType ?? "semd_dental_examination",
    payload: { draft: draft as unknown as Record<string, unknown> },
  });

  return { submissionId };
}

export async function maybeAutoQueueMedicalRecords(
  clinicId: string,
  prev: MedicalRecord[],
  next: MedicalRecord[]
): Promise<void> {
  const config = await getEgiszConfig(clinicId);
  if (!config.enabled || !config.autoSubmitSemd) return;

  const prevIds = new Set(prev.map((r) => r.id));
  const added = next.filter((r) => !prevIds.has(r.id));
  for (const record of added) {
    await queueMedicalRecordEgisz({ clinicId, medicalRecordId: record.id });
  }
}
