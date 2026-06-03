import "server-only";

import type {
  N3AddMedRecordResult,
  N3AddPatientResult,
  N3ClientConfig,
  N3MedDocumentDto,
  N3PatientDto,
} from "@/lib/egisz/n3/types";

const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const IEMK_NS = "http://tempuri.org/";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEnvelope(bodyInner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:tem="${IEMK_NS}">
  <soap:Header/>
  <soap:Body>${bodyInner}</soap:Body>
</soap:Envelope>`;
}

function parseSoapFault(xml: string): string | null {
  const fault = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (fault?.[1]) return fault[1].trim();
  const err = xml.match(/<ErrorMessage[^>]*>([\s\S]*?)<\/ErrorMessage>/i);
  if (err?.[1]) return err[1].trim();
  return null;
}

function parseGuidFromResponse(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  return xml.match(re)?.[1]?.trim();
}

function buildAuthHeader(config: N3ClientConfig): string {
  return `
    <tem:guid>${xmlEscape(config.guid)}</tem:guid>
    <tem:idLPU>${xmlEscape(config.lpuId)}</tem:idLPU>
    <tem:login>${xmlEscape(config.login)}</tem:login>
    <tem:password>${xmlEscape(config.password)}</tem:password>`;
}

function buildPatientXml(p: N3PatientDto): string {
  return `
    <tem:Patient>
      <tem:IdPatientMIS>${xmlEscape(p.idPatientMis)}</tem:IdPatientMIS>
      <tem:FamilyName>${xmlEscape(p.familyName)}</tem:FamilyName>
      <tem:GivenName>${xmlEscape(p.givenName)}</tem:GivenName>
      ${p.middleName ? `<tem:MiddleName>${xmlEscape(p.middleName)}</tem:MiddleName>` : ""}
      <tem:Sex>${p.sex}</tem:Sex>
      <tem:BirthDate>${xmlEscape(p.birthDate)}</tem:BirthDate>
      <tem:Snils>${xmlEscape(p.snils)}</tem:Snils>
      ${p.phone ? `<tem:Phone>${xmlEscape(p.phone)}</tem:Phone>` : ""}
      ${p.address ? `<tem:Address>${xmlEscape(p.address)}</tem:Address>` : ""}
    </tem:Patient>`;
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
      <tem:AddPatient>
        ${buildAuthHeader(this.config)}
        ${buildPatientXml(patient)}
      </tem:AddPatient>`;

    const xml = await this.soapCall("AddPatient", body);
    const fault = parseSoapFault(xml);
    if (fault) return { success: false, errorMessage: fault, rawResponse: xml };

    const patientGuid =
      parseGuidFromResponse(xml, "IdGlobal") ??
      parseGuidFromResponse(xml, "PatientGuid") ??
      parseGuidFromResponse(xml, "Guid");

    if (!patientGuid) {
      return {
        success: false,
        errorMessage: "N3: не получен GUID пациента",
        rawResponse: xml,
      };
    }

    return { success: true, patientGuid, rawResponse: xml };
  }

  async addMedRecord(input: {
    patientGuid: string;
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
      <tem:AddMedRecord>
        ${buildAuthHeader(this.config)}
        <tem:IdPatient>${xmlEscape(input.patientGuid)}</tem:IdPatient>
        <tem:MedRecord>
          <tem:MedDocument>
            <tem:IdDocumentMis>${xmlEscape(input.document.idDocumentMis)}</tem:IdDocumentMis>
            <tem:IdDocumentType>${xmlEscape(input.document.idDocumentType)}</tem:IdDocumentType>
            <tem:Header>${xmlEscape(input.document.header)}</tem:Header>
            <tem:DocumentAttachment>
              <tem:Data>${input.document.signedBase64}</tem:Data>
              <tem:MimeType>${xmlEscape(input.document.mimeType)}</tem:MimeType>
            </tem:DocumentAttachment>
          </tem:MedDocument>
        </tem:MedRecord>
      </tem:AddMedRecord>`;

    const xml = await this.soapCall("AddMedRecord", body);
    const fault = parseSoapFault(xml);
    if (fault) return { success: false, errorMessage: fault, rawResponse: xml };

    const documentId =
      parseGuidFromResponse(xml, "IdDocument") ??
      parseGuidFromResponse(xml, "DocumentId") ??
      parseGuidFromResponse(xml, "IdGlobal");

    if (!documentId) {
      return {
        success: false,
        errorMessage: "N3: не получен ID документа",
        rawResponse: xml,
      };
    }

    return { success: true, documentId, rawResponse: xml };
  }

  private async soapCall(action: string, bodyInner: string): Promise<string> {
    const envelope = buildEnvelope(bodyInner);
    const url = this.config.gatewayUrl.replace(/\?wsdl$/i, "");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${IEMK_NS}${action}"`,
      },
      body: envelope,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`N3 HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return text;
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
