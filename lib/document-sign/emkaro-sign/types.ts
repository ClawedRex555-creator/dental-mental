export interface EmkaroSignTenantConfig {
  organizationId: string;
  clinicId: string;
}

export interface EmkaroSignImportPatientResult {
  patientId: string;
}

export interface EmkaroSignImportDocumentResult {
  documentId: string;
  versionId: string;
  sha256: string;
}

export interface EmkaroSignAcceptedDocument {
  documentId: string;
  title: string;
  typeCode: string;
  version?: number;
  contentHash?: string;
}

export interface EmkaroSignRejectedDocument {
  documentId: string;
  title: string;
  typeCode: string;
  reason: string;
  requiredMethod?: string;
}

export interface EmkaroSignSendPackageResult {
  packageId: string | null;
  status: string;
  emkaroPatientId?: string;
  accepted?: EmkaroSignAcceptedDocument[];
  rejected?: EmkaroSignRejectedDocument[];
  devSignUrl?: string;
}

export interface EmkaroSignPackageStatus {
  packageId: string;
  status: string;
  signedAt?: string;
  documents: Array<{ externalId: string; status: string }>;
}
