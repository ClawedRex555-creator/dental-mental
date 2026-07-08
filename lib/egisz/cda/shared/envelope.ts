import {
  CDA_TYPE_ID_EXTENSION,
  CDA_TYPE_ID_ROOT,
  HL7_NS,
} from "@/lib/egisz/cda/constants";
import {
  buildOrganizationPropsXml,
  buildPatientIdentityDocXml,
  buildPatientInsurancePolicyXml,
} from "@/lib/egisz/cda/identity-xml";
import {
  DEFAULT_CONFIDENTIALITY_CODE,
  DEFAULT_CONFIDENTIALITY_NAME,
  DEFAULT_ENCOUNTER_CODE,
  DEFAULT_ENCOUNTER_NAME,
  DEFAULT_MED_SERVICE_DOC_TYPE_CODE,
  DEFAULT_MED_SERVICE_DOC_TYPE_NAME,
  DEFAULT_SERVICE_EVENT_CODE,
  DEFAULT_SERVICE_EVENT_NAME,
  NSI_CONFIDENTIALITY,
  NSI_CONFIDENTIALITY_VERSION,
  NSI_ENCOUNTER_KIND,
  NSI_ENCOUNTER_KIND_VERSION,
  NSI_GENDER,
  NSI_GENDER_VERSION,
  NSI_MED_DOC_TYPES_CDA,
  NSI_MED_DOC_TYPES_CDA_VERSION,
  NSI_MED_SERVICE_DOC_TYPE,
  NSI_MED_SERVICE_DOC_TYPE_VERSION,
  NSI_POSITIONS,
  NSI_POSITIONS_VERSION,
  NSI_REMD_RECIPIENT_ROOT,
  NSI_SERVICE_EVENT_V2,
  NSI_SERVICE_EVENT_V2_VERSION,
  NSI_SNILS_ROOT,
  CDA_HEADER_CODE_CONSULTATION,
} from "@/lib/egisz/cda/nsi-constants";
import {
  buildStructuredAddrXml,
  clinicalDocumentNamespaceAttrs,
  resolveStructuredAddress,
} from "@/lib/egisz/cda/address-xml";
import type { CdaDocumentContext, DoctorEntityContext } from "@/lib/egisz/cda/shared/types";
import {
  buildCdaPersonNameXml,
  formatCdaDate,
  mapGenderDisplay,
  xmlEscape,
} from "@/lib/egisz/cda/xml-utils";
import type { CdaTemplateMeta } from "@/lib/egisz/cda/templates/catalog";

function buildDoctorEntity(ctx: DoctorEntityContext): string {
  return `
      <id root="${xmlEscape(ctx.personnelRoot)}" extension="${xmlEscape(ctx.personnelExtension)}"/>
      <id root="${NSI_SNILS_ROOT}" extension="${xmlEscape(ctx.snils)}"/>
      <code code="${xmlEscape(ctx.positionCode)}" codeSystem="${NSI_POSITIONS}" codeSystemName="Должности медицинских и фармацевтических работников" codeSystemVersion="${NSI_POSITIONS_VERSION}" displayName="${xmlEscape(ctx.positionName)}"/>
      <assignedPerson>
        ${buildCdaPersonNameXml(ctx.familyName, ctx.givenName, ctx.middleName)}
      </assignedPerson>`;
}

function buildRepresentedOrganization(
  orgOid: string,
  orgName: string,
  orgTelecom: string,
  orgAddrXml: string
): string {
  return `
      <representedOrganization classCode="ORG">
        <id root="${xmlEscape(orgOid)}"/>
        <name>${xmlEscape(orgName)}</name>
        ${orgTelecom}
        ${orgAddrXml}
      </representedOrganization>`;
}

function buildAssignedAuthor(
  ctx: DoctorEntityContext,
  orgOid: string,
  orgName: string,
  orgTelecom: string,
  orgAddrXml: string
): string {
  return `
    <assignedAuthor>
      ${buildDoctorEntity(ctx)}
      ${buildRepresentedOrganization(orgOid, orgName, orgTelecom, orgAddrXml)}
    </assignedAuthor>`;
}

function buildAssignedEntity(
  ctx: DoctorEntityContext,
  orgOid: string,
  orgName: string,
  orgTelecom: string,
  orgAddrXml: string
): string {
  return `
    <assignedEntity>
      ${buildDoctorEntity(ctx)}
      ${buildRepresentedOrganization(orgOid, orgName, orgTelecom, orgAddrXml)}
    </assignedEntity>`;
}

export function wrapClinicalDocument(
  ctx: CdaDocumentContext,
  meta: CdaTemplateMeta,
  structuredBody: string
): string {
  const { input, orgOid, orgName, orgTelecom, orgAddrXml, doctorCtx, effectiveTime, effectiveDate } =
    ctx;
  const patient = input.patient;
  const sex = ctx.sex;
  const headerCode = meta.cdaHeaderCode ?? CDA_HEADER_CODE_CONSULTATION;
  const patientAddr = buildStructuredAddrXml(
    resolveStructuredAddress(patient.address ?? ctx.orgAddress)
  );

  const devParticipant = ctx.systemOid
    ? `
  <participant typeCode="DEV">
    <associatedEntity classCode="RGPR">
      <id root="${xmlEscape(ctx.systemOid)}" extension="${xmlEscape(ctx.productName)}"/>
      <scopingOrganization>
        <id root="${xmlEscape(orgOid)}"/>
        <name>${xmlEscape(ctx.productName)}</name>
      </scopingOrganization>
    </associatedEntity>
  </participant>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="${HL7_NS}" ${clinicalDocumentNamespaceAttrs()}>
  <realmCode code="RU"/>
  <typeId root="${CDA_TYPE_ID_ROOT}" extension="${CDA_TYPE_ID_EXTENSION}"/>
  <templateId root="${xmlEscape(meta.templateOid)}"/>
  <id root="${xmlEscape(ctx.docIdRoot)}" extension="${xmlEscape(ctx.docId)}"/>
  <code code="${xmlEscape(headerCode)}" codeSystem="${NSI_MED_DOC_TYPES_CDA}" codeSystemName="Типы медицинских документов" codeSystemVersion="${NSI_MED_DOC_TYPES_CDA_VERSION}" displayName="${xmlEscape(meta.displayName)}"/>
  <title>${xmlEscape(ctx.title)}</title>
  <effectiveTime value="${effectiveTime}"/>
  <confidentialityCode code="${DEFAULT_CONFIDENTIALITY_CODE}" codeSystem="${NSI_CONFIDENTIALITY}" codeSystemName="Уровень конфиденциальности медицинского документа" codeSystemVersion="${NSI_CONFIDENTIALITY_VERSION}" displayName="${DEFAULT_CONFIDENTIALITY_NAME}"/>
  <languageCode code="ru-RU"/>
  <setId root="${xmlEscape(ctx.setIdRoot)}" extension="${xmlEscape(ctx.setId)}"/>
  <versionNumber value="1"/>
  <recordTarget>
    <patientRole>
      <id root="${xmlEscape(ctx.patientIdRoot)}" extension="${xmlEscape(ctx.patientMisExtension)}"/>
      <id root="${NSI_SNILS_ROOT}" extension="${xmlEscape(ctx.patientSnils)}"/>
      ${buildPatientIdentityDocXml(patient)}
      ${buildPatientInsurancePolicyXml()}
      ${patientAddr}
      <patient>
        ${buildCdaPersonNameXml(patient.lastName, patient.firstName, patient.middleName)}
        <administrativeGenderCode code="${sex}" codeSystem="${NSI_GENDER}" codeSystemName="Пол пациента" codeSystemVersion="${NSI_GENDER_VERSION}" displayName="${xmlEscape(mapGenderDisplay(sex))}"/>
        <birthTime value="${formatCdaDate(patient.birthDate)}"/>
      </patient>
      <providerOrganization>
        <id root="${xmlEscape(orgOid)}"/>
        ${buildOrganizationPropsXml(input.clinic.inn)}
        <name>${xmlEscape(orgName)}</name>
        ${orgTelecom}
        ${orgAddrXml}
      </providerOrganization>
    </patientRole>
  </recordTarget>
  <author>
    <time nullFlavor="NI"/>
    ${buildAssignedAuthor(doctorCtx, orgOid, orgName, orgTelecom, orgAddrXml)}
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${xmlEscape(orgOid)}"/>
        <name>${xmlEscape(orgName)}</name>
        ${orgTelecom}
        ${orgAddrXml}
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <informationRecipient>
    <intendedRecipient>
      <receivedOrganization>
        <id root="${NSI_REMD_RECIPIENT_ROOT}"/>
        <name>Министерство здравоохранения Российской Федерации</name>
      </receivedOrganization>
    </intendedRecipient>
  </informationRecipient>
  <legalAuthenticator>
    <time nullFlavor="NI"/>
    <signatureCode nullFlavor="NI"/>
    <assignedEntity>
      ${buildDoctorEntity(doctorCtx)}
    </assignedEntity>
  </legalAuthenticator>${devParticipant}
  <documentationOf>
    <serviceEvent>
      <code code="${DEFAULT_SERVICE_EVENT_CODE}" codeSystem="${NSI_SERVICE_EVENT_V2}" codeSystemName="Типы документированных событий" codeSystemVersion="${NSI_SERVICE_EVENT_V2_VERSION}" displayName="${xmlEscape(DEFAULT_SERVICE_EVENT_NAME)}"/>
      <effectiveTime>
        <low value="${effectiveTime}"/>
        <high value="${effectiveTime}"/>
      </effectiveTime>
      <performer typeCode="PPRF">
        ${buildAssignedEntity(doctorCtx, orgOid, orgName, orgTelecom, orgAddrXml)}
      </performer>
    </serviceEvent>
  </documentationOf>
  <componentOf>
    <encompassingEncounter>
      <id root="${xmlEscape(ctx.encounterIdRoot)}" extension="${xmlEscape(ctx.encounterId)}"/>
      <id root="${xmlEscape(ctx.encounterIdRoot)}" extension="${xmlEscape(ctx.encounterCaseExtension)}"/>
      <code code="${DEFAULT_ENCOUNTER_CODE}" codeSystem="${NSI_ENCOUNTER_KIND}" codeSystemName="Типы медицинских случаев" codeSystemVersion="${NSI_ENCOUNTER_KIND_VERSION}" displayName="${xmlEscape(DEFAULT_ENCOUNTER_NAME)}"/>
      <effectiveTime>
        <low value="${effectiveDate}0000+0000"/>
      </effectiveTime>
      <medService:DocType code="${DEFAULT_MED_SERVICE_DOC_TYPE_CODE}" codeSystem="${NSI_MED_SERVICE_DOC_TYPE}" codeSystemName="Типы документов диспансерного наблюдения" codeSystemVersion="${NSI_MED_SERVICE_DOC_TYPE_VERSION}" displayName="${xmlEscape(DEFAULT_MED_SERVICE_DOC_TYPE_NAME)}"/>
    </encompassingEncounter>
  </componentOf>
  <component>
    <structuredBody>
      ${structuredBody}
    </structuredBody>
  </component>
</ClinicalDocument>`;
}
