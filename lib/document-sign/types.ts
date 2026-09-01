export type DocumentSignProvider = "emkaro" | "fdoc";

export type DocumentSignStatus = "pending" | "signed" | "expired" | "cancelled" | "failed";

export interface DocumentSignRef {
  id: string;
  name: string;
  kind?: string;
}

export interface DocumentSignRequestRecord {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  phone: string;
  documentRefs: DocumentSignRef[];
  provider: DocumentSignProvider;
  externalId?: string;
  fdocStatus?: string;
  fdocSignUrl?: string;
  signedDocumentUrl?: string;
  status: DocumentSignStatus;
  expiresAt: string;
  signedAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface DocumentSignPublicView {
  clinicName: string;
  patientName: string;
  documents: DocumentSignRef[];
  status: DocumentSignStatus;
  provider: DocumentSignProvider;
  expiresAt: string;
  signedAt?: string;
  /** Для F.Doc: пациент подписывает по ссылке из SMS F.Doc, не на /sign */
  signingHint?: string;
}

export interface DocumentSignConfigView {
  activeProvider: DocumentSignProvider;
  configuredProvider: DocumentSignProvider;
  fdocConfigured: boolean;
  emkaroSmsConfigured: boolean;
  label: string;
}
