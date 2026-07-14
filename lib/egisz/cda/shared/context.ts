import { randomUUID } from "crypto";
import {
  mapGenderToEgisz,
  normalizeSnilsDigits,
} from "@/lib/egisz/cda/constants";
import { DEFAULT_DENTAL_SERVICE_CODE, DEFAULT_DENTAL_SERVICE_NAME } from "@/lib/egisz/cda/nsi-constants";
import { extractDiagnosisCode } from "@/lib/egisz/cda/diagnosis-code";
import {
  buildStructuredAddrXml,
  resolveStructuredAddress,
} from "@/lib/egisz/cda/address-xml";
import type { CdaBuildInput, CdaDocumentContext, DoctorEntityContext } from "@/lib/egisz/cda/shared/types";
import {
  buildMisIdRoot,
  buildPersonnelIdRoot,
  formatCdaDate,
  formatCdaEffectiveTime,
  nonEmpty,
  xmlEscape,
} from "@/lib/egisz/cda/xml-utils";
import { resolveSystemId } from "@/lib/egisz/types";

function splitDoctorName(name: string): {
  familyName: string;
  givenName: string;
  middleName?: string;
} {
  const parts = name.trim().split(/\s+/);
  return {
    familyName: parts[0] ?? name,
    givenName: parts[1] ?? "—",
    middleName: parts.slice(2).join(" ") || undefined,
  };
}

export function buildCdaDocumentContext(input: CdaBuildInput): CdaDocumentContext {
  const docId = input.documentUuid.trim();
  const orgOid = input.config.organizationOid?.trim() ?? "1.2.643.5.1.13.13.12.2.61.138304";
  const orgName = nonEmpty(input.clinic.name, "Медицинская организация");
  const orgAddress = nonEmpty(input.clinic.address, "—");
  const orgPhone = input.clinic.phone?.trim();
  const productName = process.env.EGISZ_PRODUCT_NAME?.trim() || "Emkaro";
  const systemOid = resolveSystemId(input.config);

  const recordDate = input.record.createdAt?.trim()
    ? new Date(`${input.record.createdAt.slice(0, 10)}T12:00:00`)
    : new Date();
  const effectiveTime = formatCdaEffectiveTime(recordDate);
  const effectiveDate = formatCdaDate(input.record.createdAt || new Date().toISOString());

  const author = splitDoctorName(input.doctor.name);
  const patientSnils = normalizeSnilsDigits(input.patient.snils ?? "");
  const doctorSnils = normalizeSnilsDigits(input.doctor.snils ?? "");
  const sex = mapGenderToEgisz(input.patient.gender);
  const personnelRoot = buildPersonnelIdRoot(orgOid);
  const personnelExtension = input.doctor.frmrOid?.trim() || input.doctor.id;
  const positionCode = input.doctor.positionCode?.trim() || "34";
  const positionName = nonEmpty(input.doctor.specialization, "Врач-стоматолог");

  const doctorCtx: DoctorEntityContext = {
    personnelRoot,
    personnelExtension,
    snils: doctorSnils,
    positionCode,
    positionName,
    familyName: author.familyName,
    givenName: author.givenName,
    middleName: author.middleName,
  };

  const diagnosis = extractDiagnosisCode(
    input.record.diagnosisCode
      ? `${input.record.diagnosisCode} ${input.record.diagnosis}`
      : input.record.diagnosis
  );

  const complaints = nonEmpty(input.record.complaints, "Жалоб не предъявляет");
  const diseaseAnamnesis = nonEmpty(input.record.anamnesis, complaints);
  const lifeAnamnesis = nonEmpty(input.record.lifeAnamnesis, "Не отягощён");
  const objective = nonEmpty(
    input.record.objective,
    nonEmpty(input.record.treatment, "Без особенностей")
  );
  const conclusion = nonEmpty(input.record.treatment, "Проведено лечение");
  const recommendations = nonEmpty(
    input.record.recommendations,
    "Наблюдение, гигиена полости рта"
  );

  const orgTelecom = orgPhone
    ? `<telecom value="tel:${xmlEscape(orgPhone)}" use="WP"/>`
    : "";

  const misNumber = Number(process.env.EGISZ_MIS_NUMBER ?? "1") || 1;
  const misInstance = Number(process.env.EGISZ_MIS_INSTANCE ?? "1") || 1;
  const encounterId = input.record.appointmentId?.trim() || input.record.id;
  const structuredAddr = resolveStructuredAddress(orgAddress);
  const orgAddrXml = buildStructuredAddrXml(structuredAddr);

  return {
    input,
    docId,
    setId: randomUUID(),
    docIdRoot: buildMisIdRoot(orgOid, "51", misNumber, misInstance),
    setIdRoot: buildMisIdRoot(orgOid, "50", misNumber, misInstance),
    patientIdRoot: buildMisIdRoot(orgOid, "10", misNumber, misInstance),
    patientMisExtension: input.patient.id,
    encounterIdRoot: buildMisIdRoot(orgOid, "17", misNumber, misInstance),
    encounterCaseExtension: `${encounterId}-case`,
    orgOid,
    orgName,
    orgAddress,
    orgAddrXml,
    orgTelecom,
    productName,
    systemOid,
    effectiveTime,
    effectiveDate,
    patientSnils,
    sex,
    doctorCtx,
    clinical: {
      complaints,
      diseaseAnamnesis,
      lifeAnamnesis,
      objective,
      conclusion,
      recommendations,
      diagnosisCode: diagnosis.code,
      diagnosisDisplay: diagnosis.displayName,
      serviceCode: input.record.serviceCode?.trim() || DEFAULT_DENTAL_SERVICE_CODE,
      serviceName: input.record.serviceName?.trim() || DEFAULT_DENTAL_SERVICE_NAME,
    },
    encounterId,
    title: input.record.serviceName ?? "Медицинский документ",
  };
}
