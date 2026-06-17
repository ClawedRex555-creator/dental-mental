/** Типы запросов/ответов N3.Health ИЭМК / PIX */

export interface N3PatientDto {
  idPatientMis: string;
  familyName: string;
  givenName: string;
  middleName?: string;
  birthDate: string;
  sex: "1" | "2";
  snils: string;
}

export interface N3EmkPersonDto {
  idPersonMis: string;
  familyName: string;
  givenName: string;
  middleName?: string;
  snils: string;
  idSpeciality: string;
  idPosition: string;
}

export interface N3MedDocumentDto {
  idDocumentMis: string;
  idMedDocumentType: string;
  header: string;
  creationDate: string;
  dataBase64: string;
  organizationSignBase64: string;
  personalSignBase64: string;
  mimeType: string;
  author: N3EmkPersonDto;
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
