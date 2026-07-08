import type { ClinicSettings, Doctor, MedicalRecord, Patient } from "@/lib/types";
import type { EgiszClinicConfig } from "@/lib/egisz/types";

export interface CdaBuildInput {
  patient: Patient;
  doctor: Doctor;
  record: MedicalRecord;
  clinic: ClinicSettings;
  config: EgiszClinicConfig;
  /** UUID СЭМД = IdDocumentMis в AddMedRecord */
  documentUuid: string;
}

export interface DoctorEntityContext {
  personnelRoot: string;
  personnelExtension: string;
  snils: string;
  positionCode: string;
  positionName: string;
  familyName: string;
  givenName: string;
  middleName?: string;
}

export interface ClinicalNarrative {
  complaints: string;
  diseaseAnamnesis: string;
  lifeAnamnesis: string;
  objective: string;
  conclusion: string;
  recommendations: string;
  diagnosisCode: string;
  diagnosisDisplay: string;
  serviceCode: string;
  serviceName: string;
}

export interface CdaDocumentContext {
  input: CdaBuildInput;
  docId: string;
  setId: string;
  docIdRoot: string;
  setIdRoot: string;
  patientIdRoot: string;
  patientMisExtension: string;
  encounterIdRoot: string;
  encounterCaseExtension: string;
  orgOid: string;
  orgName: string;
  orgAddress: string;
  orgAddrXml: string;
  orgTelecom: string;
  productName: string;
  systemOid?: string;
  effectiveTime: string;
  effectiveDate: string;
  patientSnils: string;
  sex: "1" | "2";
  doctorCtx: DoctorEntityContext;
  clinical: ClinicalNarrative;
  encounterId: string;
  title: string;
}
