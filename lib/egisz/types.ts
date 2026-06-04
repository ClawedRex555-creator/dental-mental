/** Типы и конфигурация интеграции с ЕГИСЗ (N3.Health ИЭМК / РЭМД) */

export type EgiszSubmissionStatus =
  | "draft"
  | "queued"
  | "sent"
  | "accepted"
  | "rejected"
  | "error";

export type EgiszDocumentType =
  | "semd_consultation"
  | "semd_dental_examination"
  | "patient_registration"
  | "refusal_notice";

export type EgiszSigningMode = "stub" | "cryptopro";

/** stub — тест без SOAP; live — реальный N3 для этой клиники */
export type EgiszConnectionMode = "stub" | "live";

/** Учётные данные N3.Health (ЛК → ИЭМК) */
export interface EgiszN3Credentials {
  /** GUID медицинской организации в N3 */
  guid?: string;
  /** idLPU / идентификатор МО в ИЭМК */
  lpuId?: string;
  login?: string;
  password?: string;
}

export interface EgiszSigningConfig {
  mode: EgiszSigningMode;
  /** @deprecated храните в карточке врача (certThumbprint); fallback для одного врача */
  doctorCertThumbprint?: string;
  /** Отпечаток КЭП организации (один на клинику) */
  orgCertThumbprint?: string;
}

export interface EgiszClinicConfig {
  enabled: boolean;
  /**
   * Режим подключения этой клиники к N3.
   * У каждого юр. лица — свои credentials; stub/live задаётся отдельно.
   */
  connectionMode?: EgiszConnectionMode;
  /** OID медицинской организации в ЕГИСЗ */
  organizationOid?: string;
  /**
   * OID информационной системы Emkaro в НСИ ЕГИСЗ (справочник 1.2.643.2.69.1.2).
   * Задаётся разработчиком платформы через EGISZ_SYSTEM_ID, не выдаётся N3 клинике.
   */
  systemId?: string;
  /** URL SOAP-шлюза N3 (перекрывает EGISZ_GATEWAY_URL) */
  gatewayUrl?: string;
  /** OID типа документа CDA (СЭМД) */
  documentOid?: string;
  environment: "test" | "production";
  autoSubmitSemd: boolean;
  n3?: EgiszN3Credentials;
  signing?: EgiszSigningConfig;
}

export interface EgiszPatientIdentity {
  patientId: string;
  snils?: string;
  omsPolicyNumber?: string;
  /** GUID пациента в N3 ИЭМК после AddPatient */
  egiszPatientId?: string;
}

export interface EgiszSubmissionRecord {
  id: string;
  clinicId: string;
  patientId: string;
  medicalRecordId?: string;
  documentType: EgiszDocumentType;
  status: EgiszSubmissionStatus;
  externalId?: string;
  errorMessage?: string;
  submittedAt?: string;
  createdAt: string;
}

export interface EgiszSubmissionPayload {
  draft?: Record<string, unknown>;
  cdaXml?: string;
  signedCdaBase64?: string;
  n3PatientGuid?: string;
  n3DocumentId?: string;
  n3Response?: Record<string, unknown>;
  validationErrors?: string[];
}

export function defaultEgiszConfig(): EgiszClinicConfig {
  return {
    enabled: false,
    connectionMode: "stub",
    environment: "test",
    autoSubmitSemd: false,
    documentOid: "1.2.643.5.1.13.13.14.1.9.1.181",
    signing: { mode: "stub" },
    n3: {},
  };
}

export function resolveSystemId(config: EgiszClinicConfig): string | undefined {
  return (
    config.systemId?.trim() ||
    process.env.EGISZ_SYSTEM_ID?.trim() ||
    undefined
  );
}

export function hasCompleteN3Credentials(config: EgiszClinicConfig): boolean {
  const n3 = config.n3 ?? {};
  return Boolean(
    n3.guid?.trim() && n3.lpuId?.trim() && n3.login?.trim() && n3.password?.trim()
  );
}

function parseN3(raw: unknown): EgiszN3Credentials {
  if (!raw || typeof raw !== "object") return {};
  const d = raw as Partial<EgiszN3Credentials>;
  return {
    guid: d.guid?.trim() || undefined,
    lpuId: d.lpuId?.trim() || undefined,
    login: d.login?.trim() || undefined,
    password: d.password?.trim() || undefined,
  };
}

function parseSigning(raw: unknown): EgiszSigningConfig {
  const base: EgiszSigningConfig = { mode: "stub" };
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<EgiszSigningConfig>;
  return {
    mode: d.mode === "cryptopro" ? "cryptopro" : "stub",
    doctorCertThumbprint: d.doctorCertThumbprint?.trim() || undefined,
    orgCertThumbprint: d.orgCertThumbprint?.trim() || undefined,
  };
}

export function parseEgiszConfig(raw: unknown): EgiszClinicConfig {
  const base = defaultEgiszConfig();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<EgiszClinicConfig> & {
    n3?: unknown;
    signing?: unknown;
  };
  return {
    ...base,
    enabled: Boolean(d.enabled),
    connectionMode: d.connectionMode === "live" ? "live" : "stub",
    organizationOid: d.organizationOid?.trim() || undefined,
    systemId: d.systemId?.trim() || undefined,
    gatewayUrl: d.gatewayUrl?.trim() || undefined,
    documentOid: d.documentOid?.trim() || base.documentOid,
    environment: d.environment === "production" ? "production" : "test",
    autoSubmitSemd: Boolean(d.autoSubmitSemd),
    n3: parseN3(d.n3),
    signing: parseSigning(d.signing),
  };
}

export const EGISZ_DOCUMENT_LABELS: Record<EgiszDocumentType, string> = {
  semd_consultation: "СЭМД — консультация",
  semd_dental_examination: "СЭМД — стоматологический осмотр",
  patient_registration: "Регистрация пациента",
  refusal_notice: "Отказ от передачи в ЕГИСЗ",
};

export const EGISZ_STATUS_LABELS: Record<EgiszSubmissionStatus, string> = {
  draft: "Черновик",
  queued: "В очереди",
  sent: "Отправлено",
  accepted: "Принято",
  rejected: "Отклонено",
  error: "Ошибка",
};

export const DEFAULT_N3_TEST_GATEWAY =
  "https://b2b-demo.n3health.ru/emk/EMKService.svc";

export function resolveGatewayUrl(config: EgiszClinicConfig): string {
  return (
    config.gatewayUrl?.trim() ||
    process.env.EGISZ_GATEWAY_URL?.trim() ||
    DEFAULT_N3_TEST_GATEWAY
  );
}

export function isN3StubMode(config: EgiszClinicConfig): boolean {
  const mode = config.connectionMode ?? "stub";
  if (mode !== "live") return true;
  return !hasCompleteN3Credentials(config);
}
