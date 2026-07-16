import {
  NSI_IDENTITY_DOC_TYPE,
  NSI_IDENTITY_DOC_TYPE_VERSION,
} from "@/lib/egisz/cda/nsi-constants";
import type { Patient } from "@/lib/types";
import { formatCdaDate, nonEmpty, xmlEscape } from "@/lib/egisz/cda/xml-utils";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export interface OrganizationRequisites {
  inn?: string;
  ogrn?: string;
  ogrnip?: string;
}

/** Расширение паспорта для полного IdentityDoc (пока опционально в карточке). */
export type PatientPassportExtra = {
  passportIssuedAt?: string;
  passportIssuedBy?: string;
  passportIssuerCode?: string;
};

/** Определяет, что писать в identity:Props (ОГРН для ООО / ОГРНИП для ИП). ИНН сюда не подставляем. */
export function resolveOrganizationRegistration(
  requisites: OrganizationRequisites
): { kind: "ul" | "ip" | "none"; value?: string } {
  const inn = digitsOnly(requisites.inn ?? "");
  const ogrnip = digitsOnly(requisites.ogrnip ?? "");
  const ogrn = digitsOnly(requisites.ogrn ?? "");

  if (inn.length === 10) {
    if (ogrn.length === 13) return { kind: "ul", value: ogrn };
    return { kind: "none" };
  }
  if (inn.length === 12) {
    if (ogrnip.length === 15) return { kind: "ip", value: ogrnip };
    return { kind: "none" };
  }

  if (ogrn.length === 13 && ogrnip.length !== 15) return { kind: "ul", value: ogrn };
  if (ogrnip.length === 15 && ogrn.length !== 13) return { kind: "ip", value: ogrnip };
  return { kind: "none" };
}

/**
 * Паспорт в CDA: полный IdentityDoc только при серии+номере+дате выдачи.
 * Иначе nullFlavor=NI — неполная карточка падает на У1-21.
 */
export function buildPatientIdentityDocXml(
  patient: Patient & PatientPassportExtra
): string {
  const passportSeries = digitsOnly(patient.passportSeries ?? "");
  const passportNumber = digitsOnly(patient.passportNumber ?? "");
  const issueDateRaw = patient.passportIssuedAt?.trim() || "";
  const issueDate = issueDateRaw ? formatCdaDate(issueDateRaw) : "";

  if (passportSeries.length >= 4 && passportNumber.length >= 6 && issueDate.length >= 8) {
    const issueOrgName = nonEmpty(patient.passportIssuedBy, "не указано");
    const issueOrgCode = nonEmpty(patient.passportIssuerCode, "000-000");
    return `<identity:IdentityDoc>
        <identity:IdentityCardType xsi:type="CD" code="1" codeSystem="${NSI_IDENTITY_DOC_TYPE}" codeSystemName="Документы, удостоверяющие личность" codeSystemVersion="${NSI_IDENTITY_DOC_TYPE_VERSION}" displayName="Паспорт гражданина РФ"/>
        <identity:Series xsi:type="ST">${xmlEscape(passportSeries)}</identity:Series>
        <identity:Number xsi:type="ST">${xmlEscape(passportNumber)}</identity:Number>
        <identity:IssueOrgName xsi:type="ST">${xmlEscape(issueOrgName)}</identity:IssueOrgName>
        <identity:IssueOrgCode xsi:type="ST">${xmlEscape(issueOrgCode)}</identity:IssueOrgCode>
        <identity:IssueDate xsi:type="TS" value="${xmlEscape(issueDate)}"/>
      </identity:IdentityDoc>`;
  }

  return `<identity:IdentityDoc nullFlavor="NI"/>`;
}

export function buildPatientInsurancePolicyXml(): string {
  return `<identity:InsurancePolicy nullFlavor="NI"/>`;
}

export function buildOrganizationPropsXml(requisites: OrganizationRequisites): string {
  const reg = resolveOrganizationRegistration(requisites);
  if (reg.kind === "ip" && reg.value) {
    return `<identity:Props>
        <identity:Ogrnip xsi:type="ST">${xmlEscape(reg.value)}</identity:Ogrnip>
      </identity:Props>`;
  }
  if (reg.kind === "ul" && reg.value) {
    return `<identity:Props>
        <identity:Ogrn xsi:type="ST">${xmlEscape(reg.value)}</identity:Ogrn>
      </identity:Props>`;
  }
  return `<identity:Props nullFlavor="NI"/>`;
}

export function organizationRequisitesFromClinic(clinic: {
  inn?: string;
  ogrn?: string;
  ogrnip?: string;
}): OrganizationRequisites {
  return {
    inn: nonEmpty(clinic.inn, ""),
    ogrn: clinic.ogrn?.trim(),
    ogrnip: clinic.ogrnip?.trim(),
  };
}
