import {
  NSI_IDENTITY_DOC_TYPE,
  NSI_IDENTITY_DOC_TYPE_VERSION,
} from "@/lib/egisz/cda/nsi-constants";
import type { Patient } from "@/lib/types";
import { nonEmpty, xmlEscape } from "@/lib/egisz/cda/xml-utils";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function buildPatientIdentityDocXml(patient: Patient): string {
  const passportSeries = digitsOnly(patient.passportSeries ?? "");
  const passportNumber = digitsOnly(patient.passportNumber ?? "");
  if (passportSeries.length >= 4 && passportNumber.length >= 6) {
    return `<identity:IdentityDoc>
        <identity:IdentityCardType xsi:type="CD" code="1" codeSystem="${NSI_IDENTITY_DOC_TYPE}" codeSystemName="Документы, удостоверяющие личность" codeSystemVersion="${NSI_IDENTITY_DOC_TYPE_VERSION}" displayName="Паспорт гражданина Российской Федерации"/>
        <identity:Series>${xmlEscape(passportSeries)}</identity:Series>
        <identity:Number>${xmlEscape(passportNumber)}</identity:Number>
      </identity:IdentityDoc>`;
  }

  return `<identity:IdentityDoc nullFlavor="NI"/>`;
}

export function buildPatientInsurancePolicyXml(): string {
  return `<identity:InsurancePolicy nullFlavor="NI"/>`;
}

export function buildOrganizationPropsXml(inn?: string): string {
  const ogrn = nonEmpty(inn, "0000000000000");
  return `<identity:Props>
        <identity:Ogrn>${xmlEscape(ogrn)}</identity:Ogrn>
      </identity:Props>`;
}
