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

const NIL_FIAS =
  "00000000-0000-0000-0000-000000000000";

function parseStreetFromFreeform(address: string): string {
  const trimmed = address.trim();
  if (!trimmed || trimmed === "—") return "Адрес не указан";
  return trimmed;
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

/** Адрес МО по схематрону У1-3 / Core02-1 */
export function buildStructuredAddrXml(address: Required<StructuredAddressInput>): string {
  return `<addr>
        <address:Type xsi:type="CD" code="3" codeSystem="1.2.643.5.1.13.13.11.1504" codeSystemName="Тип адреса пациента" codeSystemVersion="1.0" displayName="Адрес проживания"/>
        <streetAddressLine>${xmlEscape(address.streetLine)}</streetAddressLine>
        <address:stateCode xsi:type="CD" code="${xmlEscape(address.regionCode)}" codeSystem="${NSI_REGION}" codeSystemName="Субъекты Российской Федерации" codeSystemVersion="${NSI_REGION_VERSION}" displayName="${xmlEscape(address.regionName)}"/>
        <postalCode>${xmlEscape(address.postalCode)}</postalCode>
        <fias:Address>
          <fias:AOGUID>${xmlEscape(address.fiasAoguid)}</fias:AOGUID>
          <fias:HOUSEGUID>${xmlEscape(address.fiasHouseguid)}</fias:HOUSEGUID>
        </fias:Address>
      </addr>`;
}

export const CDA_ADDRESS_NAMESPACES = {
  identity: "http://rosminzdrav.ru/identity",
  address: "http://rosminzdrav.ru/address",
  fias: "http://rosminzdrav.ru/fias",
  medService: "http://rosminzdrav.ru/medService",
} as const;

export function clinicalDocumentNamespaceAttrs(): string {
  return `xmlns:identity="${CDA_ADDRESS_NAMESPACES.identity}" xmlns:address="${CDA_ADDRESS_NAMESPACES.address}" xmlns:fias="${CDA_ADDRESS_NAMESPACES.fias}" xmlns:medService="${CDA_ADDRESS_NAMESPACES.medService}" xmlns:xsi="${XSI_NS}"`;
}
