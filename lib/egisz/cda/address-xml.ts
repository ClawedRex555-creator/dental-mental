import {
  NSI_REGION,
  NSI_REGION_VERSION,
  DEFAULT_REGION_CODE,
  DEFAULT_REGION_NAME,
  DEFAULT_POSTAL_CODE,
} from "@/lib/egisz/cda/nsi-constants";
import { XSI_NS } from "@/lib/egisz/cda/constants";
import { nonEmpty, xmlEscape } from "@/lib/egisz/cda/xml-utils";

export interface StructuredAddressInput {
  streetLine?: string;
  regionCode?: string;
  regionName?: string;
  postalCode?: string;
  fiasAoguid?: string;
  fiasHouseguid?: string;
}

const NIL_FIAS = "00000000-0000-0000-0000-000000000000";
const NSI_PATIENT_ADDRESS_TYPE = "1.2.643.5.1.13.13.11.1504";
const NSI_PATIENT_ADDRESS_TYPE_VERSION = "1.3";

function parseStreetFromFreeform(address: string): string {
  const trimmed = address.trim();
  if (!trimmed || trimmed === "—") return "Адрес не указан";
  return trimmed;
}

function hasRealFias(address: Required<StructuredAddressInput>): boolean {
  return (
    address.fiasAoguid !== NIL_FIAS &&
    address.fiasAoguid.trim().length > 0 &&
    address.fiasAoguid !== "00000000-0000-0000-0000-000000000000"
  );
}

function buildFiasBlock(address: Required<StructuredAddressInput>): string {
  if (!hasRealFias(address)) {
    return `<fias:Address nullFlavor="NI"/>`;
  }
  return `<fias:Address>
          <fias:AOGUID>${xmlEscape(address.fiasAoguid)}</fias:AOGUID>
          <fias:HOUSEGUID>${xmlEscape(address.fiasHouseguid)}</fias:HOUSEGUID>
        </fias:Address>`;
}

export function resolveStructuredAddress(
  freeform: string,
  overrides?: StructuredAddressInput
): Required<StructuredAddressInput> {
  return {
    streetLine: nonEmpty(overrides?.streetLine, parseStreetFromFreeform(freeform)),
    regionCode: nonEmpty(overrides?.regionCode, DEFAULT_REGION_CODE),
    regionName: nonEmpty(overrides?.regionName, DEFAULT_REGION_NAME),
    postalCode: nonEmpty(overrides?.postalCode, DEFAULT_POSTAL_CODE),
    fiasAoguid: nonEmpty(overrides?.fiasAoguid, NIL_FIAS),
    fiasHouseguid: nonEmpty(overrides?.fiasHouseguid, NIL_FIAS),
  };
}

/** Адрес пациента: address:Type обязателен (NSI 1504). */
export function buildPatientAddrXml(address: Required<StructuredAddressInput>): string {
  return `<addr>
        <address:Type xsi:type="CD" code="3" codeSystem="${NSI_PATIENT_ADDRESS_TYPE}" codeSystemName="Тип адреса пациента" codeSystemVersion="${NSI_PATIENT_ADDRESS_TYPE_VERSION}" displayName="Адрес фактического проживания (пребывания)"/>
        <streetAddressLine>${xmlEscape(address.streetLine)}</streetAddressLine>
        <address:stateCode xsi:type="CD" code="${xmlEscape(address.regionCode)}" codeSystem="${NSI_REGION}" codeSystemName="Субъекты Российской Федерации" codeSystemVersion="${NSI_REGION_VERSION}" displayName="${xmlEscape(address.regionName)}"/>
        <postalCode>${xmlEscape(address.postalCode)}</postalCode>
        ${buildFiasBlock(address)}
      </addr>`;
}

/** Адрес МО: без address:Type (NSI 1504 только для пациента). */
export function buildOrganizationAddrXml(address: Required<StructuredAddressInput>): string {
  return `<addr>
        <streetAddressLine>${xmlEscape(address.streetLine)}</streetAddressLine>
        <address:stateCode xsi:type="CD" code="${xmlEscape(address.regionCode)}" codeSystem="${NSI_REGION}" codeSystemName="Субъекты Российской Федерации" codeSystemVersion="${NSI_REGION_VERSION}" displayName="${xmlEscape(address.regionName)}"/>
        <postalCode>${xmlEscape(address.postalCode)}</postalCode>
        ${buildFiasBlock(address)}
      </addr>`;
}

/** @deprecated Используйте buildPatientAddrXml или buildOrganizationAddrXml */
export function buildStructuredAddrXml(address: Required<StructuredAddressInput>): string {
  return buildPatientAddrXml(address);
}

export const CDA_ADDRESS_NAMESPACES = {
  identity: "urn:hl7-ru:identity",
  address: "urn:hl7-ru:address",
  fias: "urn:hl7-ru:fias",
  medService: "urn:hl7-ru:medService",
} as const;

export function clinicalDocumentNamespaceAttrs(): string {
  return `xmlns:identity="${CDA_ADDRESS_NAMESPACES.identity}" xmlns:address="${CDA_ADDRESS_NAMESPACES.address}" xmlns:fias="${CDA_ADDRESS_NAMESPACES.fias}" xmlns:medService="${CDA_ADDRESS_NAMESPACES.medService}" xmlns:xsi="${XSI_NS}"`;
}
