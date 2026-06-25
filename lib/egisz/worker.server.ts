import "server-only";

import { randomUUID } from "crypto";
import { buildCdaDocument } from "@/lib/egisz/cda/builder";
import {
  getEgiszConfig,
  getEgiszSubmissionById,
  updateEgiszSubmission,
} from "@/lib/egisz/db.server";
import { validatePatientForEgisz } from "@/lib/egisz/export";
import { createN3ClientFromConfig } from "@/lib/egisz/n3/client";
import {
  mapMedDocumentToN3,
  mapPatientToN3,
  validateClinicForEgisz,
  validateDoctorForEgisz,
  validateMedicalRecordForEgisz,
} from "@/lib/egisz/n3/mappers";
import { signCdaDocument } from "@/lib/egisz/signing/index.server";
import type { EgiszSubmissionPayload } from "@/lib/egisz/types";
import { isN3StubMode, resolveGatewayUrl, type EgiszClinicConfig } from "@/lib/egisz/types";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { clinicHasModule } from "@/lib/module-access.server";
import { hasPatientEgiszTransferConsent } from "@/lib/patient-consents.server";
import type { Doctor, MedicalRecord, Patient } from "@/lib/types";

function requiresEgiszTransferConsent(config: EgiszClinicConfig): boolean {
  return Boolean(config.enabled && config.connectionMode === "live");
}

function findEntities(
  data: ClinicPersistedState,
  patientId: string,
  medicalRecordId?: string | null
): {
  patient?: Patient;
  record?: MedicalRecord;
  doctor?: Doctor;
} {
  const patient = data.patients.find((p) => p.id === patientId);
  const record = medicalRecordId
    ? data.medicalRecords.find((r) => r.id === medicalRecordId)
    : undefined;
  const doctor = record
    ? data.doctors.find((d) => d.id === record.doctorId)
    : undefined;
  return { patient, record, doctor };
}

export async function processEgiszSubmissionWorker(submissionId: string): Promise<void> {
  const submission = await getEgiszSubmissionById(submissionId);
  if (!submission) throw new Error("Отправка не найдена");
  if (submission.status !== "queued") return;
  if (!(await clinicHasModule(submission.clinicId, "egisz"))) return;

  const config = await getEgiszConfig(submission.clinicId);
  if (!config.enabled) {
    await updateEgiszSubmission(submissionId, {
      status: "error",
      errorMessage: "Интеграция ЕГИСЗ отключена в настройках клиники",
    });
    return;
  }

  const stub = isN3StubMode(config);
  const requireN3 = !stub;

  if (
    submission.documentType !== "refusal_notice" &&
    requiresEgiszTransferConsent(config)
  ) {
    const hasConsent = await hasPatientEgiszTransferConsent(
      submission.clinicId,
      submission.patientId
    );
    if (!hasConsent) {
      await updateEgiszSubmission(submissionId, {
        status: "error",
        errorMessage: "Нет согласия пациента на передачу данных в ЕГИСЗ",
      });
      return;
    }
  }

  const snapshot = await getClinicDataDb(submission.clinicId);
  if (!snapshot) {
    await updateEgiszSubmission(submissionId, {
      status: "error",
      errorMessage: "Данные клиники не найдены",
    });
    return;
  }

  const { patient, record, doctor } = findEntities(
    snapshot.data,
    submission.patientId,
    submission.medicalRecordId
  );

  const payload: EgiszSubmissionPayload = {
    ...(submission.payload ?? {}),
  };

  const validationErrors = [
    ...validateClinicForEgisz(snapshot.data.clinicSettings, config, { requireN3 }),
    ...(patient ? validatePatientForEgisz(patient) : ["Пациент не найден"]),
  ];

  if (submission.documentType === "patient_registration") {
    if (validationErrors.length) {
      payload.validationErrors = validationErrors;
      await updateEgiszSubmission(submissionId, {
        status: "error",
        errorMessage: validationErrors.join("; "),
        payload,
      });
      return;
    }
    if (!patient) return;

    const n3 = config.n3 ?? {};
    const client = createN3ClientFromConfig({
      gatewayUrl: resolveGatewayUrl(config),
      guid: n3.guid ?? "",
      lpuId: n3.lpuId ?? "",
      login: n3.login ?? "",
      password: n3.password ?? "",
      stub,
    });

    const addPatient = await client.addPatient(mapPatientToN3(patient));
    payload.n3Response = { addPatient };
    if (!addPatient.success || !addPatient.patientGuid) {
      await updateEgiszSubmission(submissionId, {
        status: "error",
        errorMessage: addPatient.errorMessage ?? "AddPatient failed",
        payload,
      });
      return;
    }
    payload.n3PatientGuid = addPatient.patientGuid;
    await updateEgiszSubmission(submissionId, {
      status: "sent",
      externalId: addPatient.patientGuid,
      payload,
    });
    return;
  }

  const signingConfig = config.signing ?? { mode: "stub" as const };
  const requireDoctorCert =
    !stub && signingConfig.mode === "cryptopro" && !signingConfig.doctorCertThumbprint?.trim();

  if (!stub && signingConfig.mode === "stub") {
    validationErrors.push(
      "Live N3: подпись stub не подходит для AddMedRecord — на тестовом контуре N3 нужны откреплённые КЭП (CryptoPro) врача и организации"
    );
  }

  validationErrors.push(
    ...(doctor
      ? validateDoctorForEgisz(doctor, { requireCert: requireDoctorCert })
      : ["Врач не найден"]),
    ...(record ? validateMedicalRecordForEgisz(record) : ["Медкарта не найдена"])
  );

  if (validationErrors.length) {
    payload.validationErrors = validationErrors;
    await updateEgiszSubmission(submissionId, {
      status: "error",
      errorMessage: validationErrors.join("; "),
      payload,
    });
    return;
  }

  if (!patient || !record || !doctor) return;

  const documentUuid = payload.egiszDocumentUuid?.trim() || randomUUID();
  payload.egiszDocumentUuid = documentUuid;

  const cdaXml = buildCdaDocument({
    patient,
    doctor,
    record,
    clinic: snapshot.data.clinicSettings,
    config,
    documentUuid,
  });
  payload.cdaXml = cdaXml;

  const signed = await signCdaDocument(cdaXml, {
    config: signingConfig,
    doctorCertThumbprint: doctor.certThumbprint,
  });
  payload.signedCdaBase64 = signed.dataBase64;

  const n3 = config.n3 ?? {};
  const client = createN3ClientFromConfig({
    gatewayUrl: resolveGatewayUrl(config),
    guid: n3.guid ?? "",
    lpuId: n3.lpuId ?? "",
    login: n3.login ?? "",
    password: n3.password ?? "",
    stub,
  });

  if (!payload.n3PatientGuid) {
    const addPatient = await client.addPatient(mapPatientToN3(patient));
    payload.n3Response = { addPatient };
    if (!addPatient.success) {
      await updateEgiszSubmission(submissionId, {
        status: "error",
        errorMessage: addPatient.errorMessage ?? "AddPatient failed",
        payload,
      });
      return;
    }
    if (addPatient.patientGuid) payload.n3PatientGuid = addPatient.patientGuid;
  }

  const medDoc = mapMedDocumentToN3({
    record,
    config,
    signed,
    doctor,
    documentUuid,
  });

  const addRecord = await client.addMedRecord({
    idPatientMis: patient.id,
    document: medDoc,
  });
  payload.n3Response = { ...(payload.n3Response ?? {}), addRecord };

  if (!addRecord.success || !addRecord.documentId) {
    await updateEgiszSubmission(submissionId, {
      status: "error",
      errorMessage: addRecord.errorMessage ?? "AddMedRecord failed",
      payload,
    });
    return;
  }

  payload.n3DocumentId = addRecord.documentId;

  await updateEgiszSubmission(submissionId, {
    status: stub ? "sent" : "sent",
    externalId: addRecord.documentId,
    payload,
  });
}

export async function processEgiszQueue(input?: {
  clinicId?: string;
  limit?: number;
}): Promise<{ processed: number; errors: string[] }> {
  const { listQueuedEgiszSubmissions } = await import("@/lib/egisz/db.server");
  const rows = await listQueuedEgiszSubmissions(input?.clinicId, input?.limit ?? 10);
  const errors: string[] = [];
  let processed = 0;

  for (const row of rows) {
    try {
      await processEgiszSubmissionWorker(row.id);
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${row.id}: ${msg}`);
      await updateEgiszSubmission(row.id, { status: "error", errorMessage: msg });
    }
  }

  return { processed, errors };
}
