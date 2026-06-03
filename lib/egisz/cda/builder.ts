import "server-only";

import { randomUUID } from "crypto";
import type { ClinicSettings, Doctor, MedicalRecord, Patient } from "@/lib/types";
import {
  CDA_TEMPLATE_OID,
  CDA_TYPE_ID_EXTENSION,
  CDA_TYPE_ID_ROOT,
  HL7_NS,
  XSI_NS,
  formatSnilsForCda,
  mapGenderToEgisz,
} from "@/lib/egisz/cda/constants";
import { mapDoctorAuthorName } from "@/lib/egisz/n3/mappers";
import type { EgiszClinicConfig } from "@/lib/egisz/types";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface CdaBuildInput {
  patient: Patient;
  doctor: Doctor;
  record: MedicalRecord;
  clinic: ClinicSettings;
  config: EgiszClinicConfig;
}

/** Сборка CDA R2 (упрощённый протокол консультации / стоматологический осмотр) */
export function buildCdaDocument(input: CdaBuildInput): string {
  const docId = randomUUID();
  const setId = randomUUID();
  const now = new Date().toISOString();
  const templateOid = input.config.documentOid ?? CDA_TEMPLATE_OID;
  const orgOid = input.config.organizationOid ?? "1.2.643.5.1.13.13.11.1469";
  const author = mapDoctorAuthorName(input.doctor);
  const snils = formatSnilsForCda(input.patient.snils ?? "");
  const sex = mapGenderToEgisz(input.patient.gender);

  const sections = [
    { title: "Жалобы", text: input.record.complaints || "—" },
    { title: "Анамнез", text: input.record.anamnesis || "—" },
    { title: "Объективно", text: input.record.objective || "—" },
    { title: "Диагноз", text: input.record.diagnosis },
    { title: "Лечение", text: input.record.treatment || "—" },
    { title: "Рекомендации", text: input.record.recommendations || "—" },
  ];

  const sectionXml = sections
    .map(
      (s, i) => `
    <component>
      <section>
        <code code="${1000 + i}" codeSystem="1.2.643.5.1.13.13.99.2.197" displayName="${xmlEscape(s.title)}"/>
        <title>${xmlEscape(s.title)}</title>
        <text>${xmlEscape(s.text)}</text>
      </section>
    </component>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="${HL7_NS}" xmlns:xsi="${XSI_NS}">
  <typeId root="${CDA_TYPE_ID_ROOT}" extension="${CDA_TYPE_ID_EXTENSION}"/>
  <templateId root="${templateOid}"/>
  <id root="${orgOid}" extension="${docId}"/>
  <code code="341" codeSystem="1.2.643.5.1.13.13.11.1520" displayName="Протокол консультации"/>
  <title>${xmlEscape(input.record.serviceName ?? "Протокол консультации")}</title>
  <effectiveTime value="${now.replace(/[-:TZ.]/g, "").slice(0, 14)}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="ru-RU"/>
  <setId root="${orgOid}" extension="${setId}"/>
  <versionNumber value="1"/>
  <recordTarget>
    <patientRole>
      <id root="1.2.643.100.3" extension="${xmlEscape(snils)}"/>
      <patient>
        <name>
          <family>${xmlEscape(input.patient.lastName)}</family>
          <given>${xmlEscape(input.patient.firstName)}</given>
          ${input.patient.middleName ? `<given>${xmlEscape(input.patient.middleName)}</given>` : ""}
        </name>
        <administrativeGenderCode code="${sex}" codeSystem="1.2.643.5.1.13.13.11.1040"/>
        <birthTime value="${input.patient.birthDate.replace(/-/g, "")}"/>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="${now.replace(/[-:TZ.]/g, "").slice(0, 14)}"/>
    <assignedAuthor>
      <id root="${xmlEscape(input.doctor.frmrOid ?? orgOid)}" extension="${xmlEscape(input.doctor.id)}"/>
      <code code="${xmlEscape(input.doctor.positionCode ?? "34")}" codeSystem="1.2.643.5.1.13.13.11.1002"/>
      <assignedPerson>
        <name>
          <family>${xmlEscape(author.familyName)}</family>
          <given>${xmlEscape(author.givenName)}</given>
          ${author.middleName ? `<given>${xmlEscape(author.middleName)}</given>` : ""}
        </name>
      </assignedPerson>
    </assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${orgOid}"/>
        <name>${xmlEscape(input.clinic.name)}</name>
        <addr>${xmlEscape(input.clinic.address ?? "—")}</addr>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <component>
    <structuredBody>${sectionXml}
    </structuredBody>
  </component>
</ClinicalDocument>`;
}
