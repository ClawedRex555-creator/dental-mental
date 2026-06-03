/** Типы запросов/ответов N3.Health ИЭМК */

export interface N3PatientDto {
  idPatientMis: string;
  familyName: string;
  givenName: string;
  middleName?: string;
  birthDate: string;
  sex: "1" | "2";
  snils: string;
  phone?: string;
  address?: string;
  documentSeries?: string;
  documentNumber?: string;
}

export interface N3MedDocumentDto {
  idDocumentMis: string;
  idDocumentType: string;
  header: string;
  cdaXml: string;
  signedBase64: string;
  mimeType: string;
}

export interface N3AddPatientResult {
  success: boolean;
  patientGuid?: string;
  rawResponse?: string;
  errorMessage?: string;
}

export interface N3AddMedRecordResult {
  success: boolean;
  documentId?: string;
  rawResponse?: string;
  errorMessage?: string;
}

export interface N3ClientConfig {
  gatewayUrl: string;
  guid: string;
  lpuId: string;
  login: string;
  password: string;
  stub: boolean;
}
