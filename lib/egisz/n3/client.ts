import "server-only";

import type {
  N3AddMedRecordResult,
  N3AddPatientResult,
  N3ClientConfig,
  N3MedDocumentDto,
  N3PatientDto,
} from "@/lib/egisz/n3/types";
import { isAbortTimeoutError, n3TimeoutMs } from "@/lib/egisz/timeouts";

const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const TEMPURI_NS = "http://tempuri.org/";
const PATIENT_DTO_NS = "http://schemas.datacontract.org/2004/07/EMKService.Data.Dto";
const MEDREC_NS = "http://schemas.datacontract.org/2004/07/N3.EMK.Dto.MedRec";
const MEDDOC_NS = "http://schemas.datacontract.org/2004/07/N3.EMK.Dto.MedRec.MedDoc";
const EMK_DTO_NS = "http://schemas.datacontract.org/2004/07/N3.EMK.Dto";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

const SNILS_DOC_TYPE = "223";
const SNILS_PROVIDER = "ПФР";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEnvelope(bodyInner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="${SOAP_NS}">
  <s:Body>${bodyInner}</s:Body>
</s:Envelope>`;
}

function parseSoapFault(xml: string): string | null {
  const patterns = [
    /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i,
    /<soap:Text[^>]*>([\s\S]*?)<\/soap:Text>/i,
    /<Text[^>]*xml:lang[^>]*>([\s\S]*?)<\/Text>/i,
    /<Message[^>]*>([\s\S]*?)<\/Message>/i,
    /<ErrorMessage[^>]*>([\s\S]*?)<\/ErrorMessage>/i,
    /<Detail[^>]*>([\s\S]*?)<\/Detail>/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    const text = m?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  if (/<soap:Fault|<Fault/i.test(xml)) {
    const code = xml.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/i)?.[1]?.trim();
    if (code) return code;
    return "SOAP Fault (без описания)";
  }
  return null;
}

function n3CallError(status: number, xml: string, step?: string): string {
  const fault = parseSoapFault(xml);
  const prefix = step ? `${step}: ` : "";
  if (fault) {
    const generic =
      /did not specify a Reason|без описания/i.test(fault) ||
      fault === "SOAP Fault (без описания)";
    if (generic) {
      return `${prefix}${fault} — проверьте журнал N3 (какой метод: AddPatient или AddMedRecord) и структуру запроса`;
    }
    return `${prefix}${fault}`;
  }
  if (status >= 400) return `${prefix}N3 HTTP ${status}`;
  return `${prefix}N3: неизвестная ошибка`;
}

function responseHasSoapFault(xml: string): boolean {
  return /<soap:Fault|<Fault[\s>]/i.test(xml);
}

function parseGuidFromResponse(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  return xml.match(re)?.[1]?.trim();
}

const EGISZ_DOCUMENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAddMedRecordDocumentId(xml: string): string | undefined {
  const tags = [
    "IdDocument",
    "DocumentId",
    "IdGlobal",
    "AddMedRecordResult",
    "localUid",
    "LocalUid",
  ];
  for (const tag of tags) {
    const value = parseGuidFromResponse(xml, tag);
    if (value) return value;
  }
  return undefined;
}

function normalizeSnilsDocN(snils: string): string {
  return snils.replace(/\D/g, "");
}

function buildPatientDtoXml(p: N3PatientDto): string {
  const snils = normalizeSnilsDocN(p.snils);
  return `
    <patient xmlns:d4p1="${PATIENT_DTO_NS}" xmlns:i="${XSI_NS}">
      <d4p1:BirthDate>${xmlEscape(p.birthDate.slice(0, 10))}</d4p1:BirthDate>
      <d4p1:Documents>
        <d4p1:DocumentDto>
          <d4p1:DocN>${xmlEscape(snils)}</d4p1:DocN>
          <d4p1:IdDocumentType>${SNILS_DOC_TYPE}</d4p1:IdDocumentType>
          <d4p1:ProviderName>${SNILS_PROVIDER}</d4p1:ProviderName>
        </d4p1:DocumentDto>
      </d4p1:Documents>
      <d4p1:FamilyName>${xmlEscape(p.familyName)}</d4p1:FamilyName>
      <d4p1:GivenName>${xmlEscape(p.givenName)}</d4p1:GivenName>
      <d4p1:IdPatientMIS>${xmlEscape(p.idPatientMis)}</d4p1:IdPatientMIS>
      <d4p1:MiddleName>${xmlEscape(p.middleName ?? "")}</d4p1:MiddleName>
      <d4p1:Sex>${p.sex}</d4p1:Sex>
    </patient>`;
}

function buildEmkPersonXml(
  prefix: string,
  person: N3MedDocumentDto["author"]
): string {
  const snils = normalizeSnilsDocN(person.snils);
  return `
          <${prefix}:Person>
            <${prefix}:HumanName>
              <${prefix}:GivenName>${xmlEscape(person.givenName)}</${prefix}:GivenName>
              <${prefix}:MiddleName>${xmlEscape(person.middleName ?? "")}</${prefix}:MiddleName>
              <${prefix}:FamilyName>${xmlEscape(person.familyName)}</${prefix}:FamilyName>
            </${prefix}:HumanName>
            <${prefix}:IdPersonMis>${xmlEscape(person.idPersonMis)}</${prefix}:IdPersonMis>
            <${prefix}:Documents>
              <${prefix}:IdentityDocument>
                <${prefix}:DocN>${xmlEscape(snils)}</${prefix}:DocN>
                <${prefix}:IdDocumentType>${SNILS_DOC_TYPE}</${prefix}:IdDocumentType>
                <${prefix}:ProviderName>${SNILS_PROVIDER}</${prefix}:ProviderName>
              </${prefix}:IdentityDocument>
            </${prefix}:Documents>
          </${prefix}:Person>
          <${prefix}:IdSpeciality>${xmlEscape(person.idSpeciality)}</${prefix}:IdSpeciality>
          <${prefix}:IdPosition>${xmlEscape(person.idPosition)}</${prefix}:IdPosition>`;
}

function buildMedRecordXml(document: N3MedDocumentDto): string {
  const author = document.author;
  return `
      <medRecord i:type="d4p3:MedDocument" xmlns:d4p1="${MEDREC_NS}" xmlns:i="${XSI_NS}" xmlns:d4p3="${MEDDOC_NS}">
        <d4p3:Attachments>
          <d4p3:MedDocumentDto.DocumentAttachment>
            <d4p3:Data>${document.dataBase64}</d4p3:Data>
            <d4p3:OrganizationSign>${document.organizationSignBase64}</d4p3:OrganizationSign>
            <d4p3:PersonalSigns>
              <d4p3:MedDocumentDto.PersonalSign>
                <d4p3:Sign>${document.personalSignBase64}</d4p3:Sign>
                <d4p3:Doctor xmlns:d9p1="${EMK_DTO_NS}">${buildEmkPersonXml("d9p1", author)}</d4p3:Doctor>
              </d4p3:MedDocumentDto.PersonalSign>
            </d4p3:PersonalSigns>
            <d4p3:MimeType>${xmlEscape(document.mimeType)}</d4p3:MimeType>
          </d4p3:MedDocumentDto.DocumentAttachment>
        </d4p3:Attachments>
        <d4p3:Author xmlns:d5p1="${EMK_DTO_NS}">${buildEmkPersonXml("d5p1", author)}</d4p3:Author>
        <d4p3:CreationDate>${xmlEscape(document.creationDate)}</d4p3:CreationDate>
        <d4p3:Header>${xmlEscape(document.header)}</d4p3:Header>
        <d4p3:IdDocumentMis>${xmlEscape(document.idDocumentMis)}</d4p3:IdDocumentMis>
        <d4p3:IdMedDocumentType>${xmlEscape(document.idMedDocumentType)}</d4p3:IdMedDocumentType>
      </medRecord>`;
}

export function resolveEmkServiceUrl(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim().replace(/\?wsdl$/i, "").replace(/\/$/, "");
  if (!trimmed) return "http://b2b-demo.n3health.ru/emk/EMKService.svc";
  if (/\/EMKService\.svc$/i.test(trimmed)) return trimmed;
  if (/\/PixService\.svc$/i.test(trimmed)) {
    return trimmed.replace(/\/PixService\.svc$/i, "/EMKService.svc");
  }
  return `${trimmed}/EMKService.svc`;
}

export function resolvePixServiceUrl(gatewayUrl: string): string {
  return resolveEmkServiceUrl(gatewayUrl).replace(/\/EMKService\.svc$/i, "/PixService.svc");
}

export class N3IemkClient {
  constructor(private readonly config: N3ClientConfig) {}

  async addPatient(patient: N3PatientDto): Promise<N3AddPatientResult> {
    if (this.config.stub) {
      return {
        success: true,
        patientGuid: `STUB-PAT-${patient.idPatientMis}`,
        rawResponse: "<stub>AddPatient</stub>",
      };
    }

    const body = `
      <AddPatient xmlns="${TEMPURI_NS}">
        <guid>${xmlEscape(this.config.guid)}</guid>
        <idLPU>${xmlEscape(this.config.lpuId)}</idLPU>
        ${buildPatientDtoXml(patient)}
      </AddPatient>`;

    const { status, text: xml } = await this.soapCall({
      url: resolvePixServiceUrl(this.config.gatewayUrl),
      soapAction: `"${TEMPURI_NS}IPixService/AddPatient"`,
      bodyInner: body,
    });
    if (responseHasSoapFault(xml) || status >= 400) {
      return {
        success: false,
        errorMessage: n3CallError(status, xml, "AddPatient (PixService)"),
        rawResponse: xml,
      };
    }

    const patientGuid =
      parseGuidFromResponse(xml, "IdGlobal") ??
      parseGuidFromResponse(xml, "PatientGuid") ??
      parseGuidFromResponse(xml, "Guid");

    if (!patientGuid && !/<AddPatientResponse/i.test(xml)) {
      return {
        success: false,
        errorMessage:
          "AddPatient (PixService): N3 не вернул GUID пациента — проверьте СНИЛС и idPatientMIS",
        rawResponse: xml,
      };
    }

    return {
      success: true,
      patientGuid: patientGuid ?? patient.idPatientMis,
      rawResponse: xml,
    };
  }

  async addMedRecord(input: {
    idPatientMis: string;
    document: N3MedDocumentDto;
  }): Promise<N3AddMedRecordResult> {
    if (this.config.stub) {
      return {
        success: true,
        documentId: `STUB-DOC-${input.document.idDocumentMis}`,
        rawResponse: "<stub>AddMedRecord</stub>",
      };
    }

    const body = `
      <AddMedRecord xmlns="${TEMPURI_NS}">
        <guid>${xmlEscape(this.config.guid)}</guid>
        <idLpu>${xmlEscape(this.config.lpuId)}</idLpu>
        <idPatientMis>${xmlEscape(input.idPatientMis)}</idPatientMis>
        ${buildMedRecordXml(input.document)}
      </AddMedRecord>`;

    const { status, text: xml } = await this.soapCall({
      url: resolveEmkServiceUrl(this.config.gatewayUrl),
      soapAction: `"${TEMPURI_NS}IEmkService/AddMedRecord"`,
      bodyInner: body,
    });
    if (responseHasSoapFault(xml) || status >= 400) {
      return {
        success: false,
        errorMessage: n3CallError(status, xml, "AddMedRecord (EMKService)"),
        rawResponse: xml,
      };
    }

    const documentId = parseAddMedRecordDocumentId(xml);

    if (!documentId) {
      const misId = input.document.idDocumentMis.trim();
      // N3 demo часто возвращает пустой <AddMedRecordResponse/> без SOAP Fault
      if (
        /<AddMedRecordResponse/i.test(xml) &&
        EGISZ_DOCUMENT_UUID_RE.test(misId)
      ) {
        return {
          success: true,
          documentId: misId,
          rawResponse: xml,
        };
      }
      return {
        success: false,
        errorMessage:
          "N3: не получен ID документа — IdDocumentMis должен быть UUID и совпадать с id в CDA",
        rawResponse: xml,
      };
    }

    return { success: true, documentId, rawResponse: xml };
  }

  private async soapCall(input: {
    url: string;
    soapAction: string;
    bodyInner: string;
  }): Promise<{ status: number; text: string }> {
    const envelope = buildEnvelope(input.bodyInner);
    const timeoutMs = n3TimeoutMs();

    let res: Response;
    try {
      res = await fetch(input.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction: input.soapAction,
        },
        body: envelope,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isAbortTimeoutError(error)) {
        throw new Error(
          `N3 SOAP таймаут ${Math.round(timeoutMs / 1000)} с (${input.url}). Проверьте OpenVPN к N3 на сервере (systemctl status emkaro-n3-vpn) и доступность шлюза.`
        );
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `N3 SOAP недоступен (${input.url}): ${msg}. Обычно нет OpenVPN к b2b-demo.n3health.ru.`
      );
    }

    const text = await res.text();
    return { status: res.status, text };
  }
}

export function createN3ClientFromConfig(input: {
  gatewayUrl: string;
  guid: string;
  lpuId: string;
  login: string;
  password: string;
  stub: boolean;
}): N3IemkClient {
  return new N3IemkClient(input);
}
