import "server-only";

import type { DocumentSignRef } from "@/lib/document-sign/types";
import { upsertPatientConsent } from "@/lib/patient-consents.server";

function mapDocumentsToConsents(
  documentRefs: DocumentSignRef[]
): { consentType: "personal_data_processing" | "medical_intervention"; documentRef: string }[] {
  const out: {
    consentType: "personal_data_processing" | "medical_intervention";
    documentRef: string;
  }[] = [];

  for (const doc of documentRefs) {
    if (doc.kind === "egisz_refusal") continue;
    if (doc.kind === "contract") {
      out.push({ consentType: "personal_data_processing", documentRef: doc.name });
    } else if (doc.kind === "consent") {
      out.push({ consentType: "medical_intervention", documentRef: doc.name });
    }
  }
  return out;
}

/** Запись согласий после успешной подписи (Emkaro или F.Doc). */
export async function applyDocumentSignConsents(input: {
  clinicId: string;
  patientId: string;
  requestId: string;
  documentRefs: DocumentSignRef[];
  signedAt: string;
  source: "emkaro" | "fdoc";
}): Promise<void> {
  const label = input.source === "fdoc" ? "F.Doc" : "ПЭП по SMS";
  const consents = mapDocumentsToConsents(input.documentRefs);
  for (const c of consents) {
    await upsertPatientConsent({
      clinicId: input.clinicId,
      patientId: input.patientId,
      consentType: c.consentType,
      granted: true,
      documentRef: `document-sign:${input.requestId}:${c.documentRef}`,
      notes: `${label} ${input.signedAt}`,
    });
  }

  if (input.documentRefs.some((d) => d.kind === "egisz_refusal")) {
    await upsertPatientConsent({
      clinicId: input.clinicId,
      patientId: input.patientId,
      consentType: "egisz_transfer",
      granted: false,
      documentRef: `document-sign:${input.requestId}`,
      notes: `Отказ ЕГИСЗ, ${label} ${input.signedAt}`,
    });
  }
}
