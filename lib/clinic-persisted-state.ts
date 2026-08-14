import { mergeClinicServices, migrateServices } from "@/lib/service-categories";
import {
  mergeAssistantManualHours,
  normalizeAssistantManualHours,
  type AssistantManualHoursMap,
} from "@/lib/assistant-hours";
import {
  findOrphanPatientIds,
  patientsLostButAppointmentsRemain,
  isRestoredPatientStub,
  repairMissingPatientsInSnapshot,
} from "@/lib/patient-visits";
import { filterPaymentsWithExistingWorkActs } from "@/lib/work-act-payment";
import { detachDeletedWorkActsFromAppointments } from "@/lib/work-act-visit";
import { withUniqueWorkActNumbers } from "@/lib/work-act-number";
import type {
  Appointment,
  Cabinet,
  ClinicDocumentTemplate,
  ClinicExpense,
  ClinicSettings,
  Doctor,
  DoctorMonthSchedule,
  Invoice,
  LegalDocument,
  MedicalRecord,
  OnlineBookingRequest,
  Patient,
  PatientFile,
  PatientNote,
  PatientPrepayment,
  Payment,
  Service,
  Task,
  ThemeMode,
  ToothRecord,
  TreatmentPlan,
  WarehouseItem,
  WorkAct,
} from "@/lib/types";
import { defaultWeeklySchedule } from "@/lib/clinic-schedule";
import { isClinicServerDatabaseMode } from "@/lib/clinic-client-mode";
import { clinicSettings as defaultClinicSettings } from "@/lib/mock-data";
import { isAllowedDataUrl } from "@/lib/safe-data-url";

/** Данные клиники, синхронизируемые между устройствами */
export interface ClinicPersistedState {
  doctors: Doctor[];
  services: Service[];
  cabinets: Cabinet[];
  patients: Patient[];
  appointments: Appointment[];
  medicalRecords: MedicalRecord[];
  treatmentPlans: TreatmentPlan[];
  payments: Payment[];
  invoices: Invoice[];
  workActs: WorkAct[];
  actCounter: number;
  warehouse: WarehouseItem[];
  tasks: Task[];
  onlineBookings: OnlineBookingRequest[];
  patientFiles: PatientFile[];
  patientNotes: PatientNote[];
  teethByPatient: Record<string, ToothRecord[]>;
  clinicSettings: ClinicSettings;
  documentTemplates: ClinicDocumentTemplate[];
  clinicExpenses: ClinicExpense[];
  legalDocuments: LegalDocument[];
  deletedLegalDocumentIds?: string[];
  deletedServiceIds?: string[];
  /** Явно удалённые акты — не поднимать с сервера до повторного создания */
  deletedWorkActIds?: string[];
  /** Явно удалённые пациенты — защита от воскрешения устаревшей вкладкой */
  deletedPatientIds?: string[];
  /** Явно удалённые сотрудники — pending/pull не должны восстанавливать */
  deletedDoctorIds?: string[];
  /** Явно удалённые записи расписания */
  deletedAppointmentIds?: string[];
  deletedMedicalRecordIds?: string[];
  deletedTreatmentPlanIds?: string[];
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  userThemePreferences: Record<string, ThemeMode>;
  /** Ручной ввод часов ассистента (зарплаты), ключ — id сотрудника */
  assistantManualHours: AssistantManualHoursMap;
}

export const CLINIC_DATA_SCHEMA_VERSION = 1;

export function createFreshPersistedState(): ClinicPersistedState {
  return {
    doctors: [],
    services: [],
    cabinets: [],
    patients: [],
    appointments: [],
    medicalRecords: [],
    treatmentPlans: [],
    payments: [],
    invoices: [],
    workActs: [],
    actCounter: 1,
    warehouse: [],
    tasks: [],
    onlineBookings: [],
    patientFiles: [],
    patientNotes: [],
    teethByPatient: {},
    clinicSettings: {
      ...defaultClinicSettings,
      weeklySchedule: defaultWeeklySchedule(),
    },
    documentTemplates: [],
    clinicExpenses: [],
    legalDocuments: [],
    deletedServiceIds: [],
    deletedWorkActIds: [],
    deletedPatientIds: [],
    deletedDoctorIds: [],
    deletedAppointmentIds: [],
    deletedMedicalRecordIds: [],
    deletedTreatmentPlanIds: [],
    doctorSchedules: [],
    prepayments: [],
    userThemePreferences: {},
    assistantManualHours: {},
  };
}

type PersistPickSource = {
  doctors: Doctor[];
  services: Service[];
  cabinets: Cabinet[];
  patients: Patient[];
  appointments: Appointment[];
  medicalRecords: MedicalRecord[];
  treatmentPlans: TreatmentPlan[];
  payments: Payment[];
  invoices: Invoice[];
  workActs: WorkAct[];
  actCounter: number;
  warehouse: WarehouseItem[];
  tasks: Task[];
  onlineBookings: OnlineBookingRequest[];
  patientFiles: PatientFile[];
  patientNotes: PatientNote[];
  teethByPatient: Record<string, ToothRecord[]>;
  clinicSettings: ClinicSettings;
  documentTemplates: ClinicDocumentTemplate[];
  clinicExpenses: ClinicExpense[];
  legalDocuments: LegalDocument[];
  deletedLegalDocumentIds?: string[];
  deletedServiceIds?: string[];
  deletedWorkActIds?: string[];
  deletedPatientIds?: string[];
  deletedDoctorIds?: string[];
  deletedAppointmentIds?: string[];
  deletedMedicalRecordIds?: string[];
  deletedTreatmentPlanIds?: string[];
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  userThemePreferences: Record<string, ThemeMode>;
  assistantManualHours?: AssistantManualHoursMap;
};

/** Только безопасные для localStorage поля (production + DATABASE_URL) */
export type ClientSafePersistedState = Pick<ClinicPersistedState, "userThemePreferences">;

export function pickClientSafePersistedState(
  state: Pick<PersistPickSource, "userThemePreferences">
): ClientSafePersistedState {
  return {
    userThemePreferences: state.userThemePreferences ?? {},
  };
}

export function pickPersistedStateForStorage(
  state: PersistPickSource
): ClinicPersistedState | ClientSafePersistedState {
  if (isClinicServerDatabaseMode()) {
    return pickClientSafePersistedState(state);
  }
  return pickPersistedState(state);
}

function sanitizePatientFiles(files: PatientFile[]): PatientFile[] {
  return files.map((f) => {
    if (!f.dataUrl) return f;
    if (!isAllowedDataUrl(f.dataUrl)) {
      const { dataUrl: _removed, ...rest } = f;
      return rest;
    }
    return f;
  });
}

function sanitizeLegalDocuments(docs: LegalDocument[]): LegalDocument[] {
  return docs.map((d) => {
    if (!d.fileDataUrl) return d;
    if (!isAllowedDataUrl(d.fileDataUrl)) {
      const { fileDataUrl: _removed, ...rest } = d;
      return rest;
    }
    return d;
  });
}

function sanitizeClinicExpenses(expenses: ClinicExpense[]): ClinicExpense[] {
  return expenses.map((e) => {
    if (!e.receiptDataUrl) return e;
    if (!isAllowedDataUrl(e.receiptDataUrl)) {
      const { receiptDataUrl: _removed, ...rest } = e;
      return rest;
    }
    return e;
  });
}

export function pickPersistedState(state: PersistPickSource): ClinicPersistedState {
  return {
    doctors: state.doctors ?? [],
    services: migrateServices(state.services ?? []),
    cabinets: state.cabinets ?? [],
    patients: state.patients ?? [],
    appointments: state.appointments ?? [],
    medicalRecords: state.medicalRecords ?? [],
    treatmentPlans: state.treatmentPlans ?? [],
    payments: state.payments ?? [],
    invoices: state.invoices ?? [],
    workActs: state.workActs ?? [],
    actCounter: state.actCounter ?? 1,
    warehouse: state.warehouse ?? [],
    tasks: state.tasks ?? [],
    onlineBookings: state.onlineBookings ?? [],
    patientFiles: sanitizePatientFiles(state.patientFiles ?? []),
    patientNotes: state.patientNotes ?? [],
    teethByPatient: state.teethByPatient ?? {},
    clinicSettings: state.clinicSettings,
    documentTemplates: state.documentTemplates ?? [],
    clinicExpenses: sanitizeClinicExpenses(state.clinicExpenses ?? []),
    legalDocuments: sanitizeLegalDocuments(state.legalDocuments ?? []),
    deletedLegalDocumentIds: state.deletedLegalDocumentIds ?? [],
    deletedServiceIds: state.deletedServiceIds ?? [],
    deletedWorkActIds: state.deletedWorkActIds ?? [],
    deletedPatientIds: state.deletedPatientIds ?? [],
    deletedDoctorIds: state.deletedDoctorIds ?? [],
    deletedAppointmentIds: state.deletedAppointmentIds ?? [],
    deletedMedicalRecordIds: state.deletedMedicalRecordIds ?? [],
    deletedTreatmentPlanIds: state.deletedTreatmentPlanIds ?? [],
    doctorSchedules: state.doctorSchedules ?? [],
    prepayments: state.prepayments ?? [],
    userThemePreferences: state.userThemePreferences ?? {},
    assistantManualHours: normalizeAssistantManualHours(state.assistantManualHours),
  };
}

/** Пустой «шаблон» с вкладки (не осознанное удаление сотрудника/пациента) */
export function isBlankClientClinicShell(incoming: ClinicPersistedState): boolean {
  if (hasClinicData(incoming)) return false;
  return (
    incoming.cabinets.length === 0 &&
    incoming.services.length === 0 &&
    incoming.medicalRecords.length === 0 &&
    incoming.documentTemplates.length === 0 &&
    incoming.warehouse.length === 0 &&
    incoming.clinicExpenses.length === 0 &&
    incoming.legalDocuments.length === 0 &&
    incoming.doctorSchedules.length === 0 &&
    incoming.prepayments.length === 0
  );
}

/**
 * Блокировать запись пустого toSave поверх непустого existing.
 * Не блокирует удаление последнего врача/пациента (снимок после merge может стать «пустым»).
 */
export function shouldRejectEmptyClinicOverwrite(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState,
  toSave: ClinicPersistedState
): boolean {
  if (!hasClinicData(existing) || hasClinicData(toSave)) return false;

  const removedPatients =
    isDeletionOnlySubset(existing.patients, incoming.patients) &&
    incoming.patients.length < existing.patients.length;
  if (removedPatients) return false;

  const removedDoctors =
    isDeletionOnlySubset(existing.doctors, incoming.doctors) &&
    incoming.doctors.length < existing.doctors.length;
  if (removedDoctors && !isBlankClientClinicShell(incoming)) return false;

  if (!isBlankClientClinicShell(incoming)) return false;
  return true;
}

/** Есть ли в снимке реальные данные клиники (не пустой шаблон) */
export function hasClinicData(state: ClinicPersistedState): boolean {
  return (
    state.patients.length > 0 ||
    state.doctors.length > 0 ||
    state.services.length > 0 ||
    state.cabinets.length > 0 ||
    state.appointments.length > 0 ||
    state.workActs.length > 0 ||
    state.payments.length > 0 ||
    state.treatmentPlans.length > 0 ||
    state.medicalRecords.length > 0 ||
    state.clinicExpenses.length > 0
  );
}

/** Удаления в UI: в снимке только старые id, без подмены справочников */
export function isDeletionOnlySubset<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): boolean {
  if (incoming.length > existing.length) return true;
  const existingIds = new Set(existing.map((x) => x.id));
  return incoming.every((x) => existingIds.has(x.id));
}

/** На сервере есть id, которых нет в локальном снимке (другое устройство сохранило данные) */
export function hasEntityIdsNotInIncoming<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): boolean {
  const incomingIds = new Set(incoming.map((x) => x.id));
  return existing.some((x) => !incomingIds.has(x.id));
}

const RECOVERY_ENTITY_LIST_KEYS = [
  "patients",
  "appointments",
  "workActs",
  "payments",
  "invoices",
  "medicalRecords",
  "treatmentPlans",
  "prepayments",
  "patientNotes",
  "patientFiles",
  "legalDocuments",
  "clinicExpenses",
] as const satisfies ReadonlyArray<keyof ClinicPersistedState>;

/** Локальный снимок содержит записи, которых ещё нет на сервере */
export function snapshotHasLocalOnlyEntities(
  local: ClinicPersistedState,
  remote: ClinicPersistedState
): boolean {
  for (const key of RECOVERY_ENTITY_LIST_KEYS) {
    const localRows = local[key] as { id: string }[];
    const remoteRows = remote[key] as { id: string }[];
    if (hasEntityIdsNotInIncoming(localRows, remoteRows)) return true;
  }
  return false;
}

/** Сервер опережает локальный буфер (новые id или изменения по общим id) */
export function serverSnapshotHasUpdatesBeyond(
  remote: ClinicPersistedState,
  baseline: ClinicPersistedState
): boolean {
  for (const key of RECOVERY_ENTITY_LIST_KEYS) {
    const remoteRows = remote[key] as { id: string }[];
    const baselineRows = baseline[key] as { id: string }[];
    if (hasEntityIdsNotInIncoming(remoteRows, baselineRows)) return true;
    const remoteById = new Map(remoteRows.map((x) => [x.id, x]));
    for (const row of baselineRows) {
      const serverRow = remoteById.get(row.id);
      if (serverRow && JSON.stringify(serverRow) !== JSON.stringify(row)) return true;
    }
  }
  if (doctorSchedulesDifferQuick(remote.doctorSchedules, baseline.doctorSchedules)) return true;
  return false;
}

function doctorSchedulesDifferQuick(
  remote: ClinicPersistedState["doctorSchedules"],
  baseline: ClinicPersistedState["doctorSchedules"]
): boolean {
  const remoteByKey = new Map(remote.map((s) => [doctorScheduleKey(s), s]));
  for (const row of baseline) {
    const serverRow = remoteByKey.get(doctorScheduleKey(row));
    if (!serverRow) continue;
    if (
      serverRow.updatedAt !== row.updatedAt ||
      JSON.stringify(serverRow.days) !== JSON.stringify(row.days)
    ) {
      return true;
    }
  }
  for (const row of remote) {
    if (!baseline.some((b) => doctorScheduleKey(b) === doctorScheduleKey(row))) return true;
  }
  return false;
}

/** Объединение по id: записи из local (вторая коллекция) перекрывают remote */
export function mergeByIdPreferLocal<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const x of remote) map.set(x.id, x);
  for (const x of local) map.set(x.id, x);
  return Array.from(map.values());
}

const PATIENT_PHI_MERGE_KEYS = [
  "phone",
  "email",
  "snils",
  "passportSeries",
  "passportNumber",
  "passportIssuedBy",
  "passportIssuedAt",
  "passportIssuerCode",
  "address",
  "birthCertificateSeries",
  "birthCertificateNumber",
  "representativePassportSeries",
  "representativePassportNumber",
] as const satisfies ReadonlyArray<keyof Patient>;

function isEmptyPatientPhiValue(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/**
 * Local wins, но пустой PHI из local не затирает непустой remote
 * (типичный след редакции врача / битого кэша).
 * Автозаглушка «имя Уточните» никогда не перебивает реальное ФИО.
 */
export function mergePatientPreferLocalPreservePhi(
  remote: Patient,
  local: Patient
): Patient {
  if (isRestoredPatientStub(local) && !isRestoredPatientStub(remote)) {
    return remote;
  }
  const merged: Patient = { ...remote, ...local };
  if (isRestoredPatientStub(remote) && !isRestoredPatientStub(local)) {
    // local — реальная карточка: забираем ФИО/контакты целиком, stub-метки сбрасываем
    merged.firstName = local.firstName;
    merged.lastName = local.lastName;
    merged.middleName = local.middleName;
    if (local.notes !== undefined) merged.notes = local.notes;
    if (local.previousVisitsNote !== undefined) {
      merged.previousVisitsNote = local.previousVisitsNote;
    }
    if (local.source) merged.source = local.source;
  }
  for (const key of PATIENT_PHI_MERGE_KEYS) {
    if (isEmptyPatientPhiValue(local[key]) && !isEmptyPatientPhiValue(remote[key])) {
      (merged as unknown as Record<string, unknown>)[key] = remote[key];
    }
  }
  if (
    isEmptyPatientPhiValue(local.notificationPrefs?.telegramChatId) &&
    !isEmptyPatientPhiValue(remote.notificationPrefs?.telegramChatId)
  ) {
    merged.notificationPrefs = {
      ...remote.notificationPrefs!,
      ...local.notificationPrefs,
      telegramChatId: remote.notificationPrefs!.telegramChatId,
    };
  }
  return merged;
}

/**
 * Конфликт PUT (устаревший CAS): для пациентов предпочитаем server.
 * Карточка пишется через /api/clinic/patients/update; stale full-snapshot PUT
 * не должен откатывать только что сохранённое ФИО.
 * Stub «имя Уточните» всё равно уступает реальной карточке с клиента.
 */
export function mergePatientsOnWriteConflict(
  server: Patient[],
  client: Patient[]
): Patient[] {
  const map = new Map<string, Patient>();
  for (const p of client) map.set(p.id, p);
  for (const p of server) {
    const clientPatient = map.get(p.id);
    if (!clientPatient) {
      map.set(p.id, p);
      continue;
    }
    if (isRestoredPatientStub(p) && !isRestoredPatientStub(clientPatient)) {
      map.set(p.id, mergePatientPreferLocalPreservePhi(p, clientPatient));
      continue;
    }
    // Server wins (включая свежую карточку после patient command API)
    map.set(p.id, p);
  }
  return Array.from(map.values());
}

export function mergePatientsPreferLocalPreservePhi(
  remote: Patient[],
  local: Patient[]
): Patient[] {
  const map = new Map<string, Patient>();
  for (const x of remote) map.set(x.id, x);
  for (const x of local) {
    const prev = map.get(x.id);
    map.set(x.id, prev ? mergePatientPreferLocalPreservePhi(prev, x) : x);
  }
  return Array.from(map.values());
}

/** Явное удаление в local: не поднимать строки, которых уже нет в local */
export function hasEntityListDeletion<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): boolean {
  return (
    isDeletionOnlySubset(existing, incoming) && incoming.length < existing.length
  );
}

/**
 * Incoming wins по метаданным, но «урезанная» копия без fileDataUrl
 * (slim pending-буфер) не должна затирать уже загруженный файл.
 */
export function mergeLegalDocumentPreferFile(
  existing: LegalDocument,
  incoming: LegalDocument
): LegalDocument {
  const merged: LegalDocument = { ...existing, ...incoming };
  const incomingHasFile =
    typeof incoming.fileDataUrl === "string" && incoming.fileDataUrl.length > 0;
  const existingHasFile =
    typeof existing.fileDataUrl === "string" && existing.fileDataUrl.length > 0;

  if (incomingHasFile) {
    merged.fileDataUrl = incoming.fileDataUrl;
    if (incoming.fileName) merged.fileName = incoming.fileName;
  } else if (existingHasFile) {
    merged.fileDataUrl = existing.fileDataUrl;
    if (!merged.fileName && existing.fileName) merged.fileName = existing.fileName;
  }

  if (!merged.fileDataUrl && !merged.templateUrl && existing.templateUrl) {
    merged.templateUrl = existing.templateUrl;
  }

  return merged;
}

/**
 * Юр. документы: union server + client, без потери записей с другого устройства.
 * Tombstones — явные удаления с этой вкладки.
 */
export function mergeLegalDocumentsState(
  existing: LegalDocument[],
  incoming: LegalDocument[],
  existingTombstones: string[] = [],
  incomingTombstones: string[] = []
): { legalDocuments: LegalDocument[]; deletedLegalDocumentIds: string[] } {
  // Tombstones must dominate stale snapshots: if one client deleted a document,
  // another client with old data must not resurrect it on save.
  const deletedLegalDocumentIds = [...new Set([...existingTombstones, ...incomingTombstones])];
  const tombstoneSet = new Set(deletedLegalDocumentIds);
  const map = new Map<string, LegalDocument>();
  for (const doc of existing) {
    if (tombstoneSet.has(doc.id)) continue;
    map.set(doc.id, doc);
  }
  for (const doc of incoming) {
    if (tombstoneSet.has(doc.id)) continue;
    const prev = map.get(doc.id);
    map.set(doc.id, prev ? mergeLegalDocumentPreferFile(prev, doc) : doc);
  }
  return {
    legalDocuments: Array.from(map.values()),
    deletedLegalDocumentIds,
  };
}

/**
 * Услуги: union server + client, без потери записей с другого устройства.
 * Tombstones — явные удаления услуг в каталоге.
 */
export function mergeServicesState(
  existing: Service[],
  incoming: Service[],
  existingTombstones: string[] = [],
  incomingTombstones: string[] = []
): { services: Service[]; deletedServiceIds: string[] } {
  const deletedServiceIds = [...new Set([...existingTombstones, ...incomingTombstones])];
  const tombstoneSet = new Set(deletedServiceIds);
  const services = mergeClinicServices(existing, incoming).filter(
    (service) => !tombstoneSet.has(service.id)
  );
  return { services, deletedServiceIds };
}

/** Не поднимать услуги, помеченные tombstone */
export function applyDeletedServiceTombstones(
  snapshot: ClinicPersistedState,
  tombstones: string[] = snapshot.deletedServiceIds ?? []
): ClinicPersistedState {
  if (!tombstones.length) return snapshot;
  const tombstoneSet = new Set(tombstones);
  const services = snapshot.services.filter((service) => !tombstoneSet.has(service.id));
  if (services.length === snapshot.services.length) {
    return { ...snapshot, deletedServiceIds: tombstones };
  }
  return {
    ...snapshot,
    deletedServiceIds: tombstones,
    services,
  };
}

/**
 * Акты: union server + client, без потери записей с другого устройства.
 * Tombstones — явные удаления с этой вкладки.
 */
export function mergeWorkActsState(
  existing: WorkAct[],
  incoming: WorkAct[],
  existingTombstones: string[] = [],
  incomingTombstones: string[] = []
): { workActs: WorkAct[]; deletedWorkActIds: string[] } {
  // Tombstones must dominate stale snapshots: if one client deleted an act,
  // another client with old data must not resurrect it on save.
  const deletedWorkActIds = [...new Set([...existingTombstones, ...incomingTombstones])];
  const tombstoneSet = new Set(deletedWorkActIds);
  const workActs = mergeByIdPreferLocal(existing, incoming).filter(
    (a) => !tombstoneSet.has(a.id)
  );
  return { workActs, deletedWorkActIds };
}

/** Не поднимать юр. документы, помеченные tombstone (например после pull со старым сервером) */
export function applyDeletedLegalDocumentTombstones(
  snapshot: ClinicPersistedState,
  tombstones: string[] = snapshot.deletedLegalDocumentIds ?? []
): ClinicPersistedState {
  if (!tombstones.length) return snapshot;
  const tombstoneSet = new Set(tombstones);
  const legalDocuments = snapshot.legalDocuments.filter((d) => !tombstoneSet.has(d.id));
  if (legalDocuments.length === snapshot.legalDocuments.length) {
    return { ...snapshot, deletedLegalDocumentIds: tombstones };
  }
  return {
    ...snapshot,
    deletedLegalDocumentIds: tombstones,
    legalDocuments,
  };
}

/** Не поднимать акты, помеченные tombstone (например после pull со старым сервером) */
export function applyDeletedWorkActTombstones(
  snapshot: ClinicPersistedState,
  tombstones: string[] = snapshot.deletedWorkActIds ?? []
): ClinicPersistedState {
  if (!tombstones.length) return snapshot;
  const tombstoneSet = new Set(tombstones);
  const workActs = snapshot.workActs.filter((a) => !tombstoneSet.has(a.id));
  const appointments = detachDeletedWorkActsFromAppointments(
    snapshot.appointments,
    tombstones
  );
  const workActsChanged = workActs.length !== snapshot.workActs.length;
  const appointmentsChanged = appointments !== snapshot.appointments;
  if (!workActsChanged && !appointmentsChanged) {
    return { ...snapshot, deletedWorkActIds: tombstones };
  }
  return repairFinancialCoupling({
    ...snapshot,
    deletedWorkActIds: tombstones,
    workActs,
    appointments,
  });
}

/** Объединить списки tombstone-id без дублей */
export function unionTombstoneIds(...lists: Array<string[] | undefined>): string[] {
  return [...new Set(lists.flatMap((list) => list ?? []))];
}

/**
 * Слияние списков сущностей с tombstones: удалённые id не воскресают
 * даже если устаревшая вкладка всё ещё их присылает.
 */
export function mergeEntityListWithTombstones<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  existingTombstones: string[] = [],
  incomingTombstones: string[] = []
): { items: T[]; deletedIds: string[] } {
  const deletedIds = unionTombstoneIds(existingTombstones, incomingTombstones);
  const tombstoneSet = new Set(deletedIds);
  const items = mergeByIdPreferLocal(existing, incoming).filter(
    (row) => !tombstoneSet.has(row.id)
  );
  return { items, deletedIds };
}

/**
 * Финальный фильтр: все tombstones из снимка вычищают сущности
 * (пациенты / сотрудники / записи / медкарты / планы + каскад по patientId).
 */
export function applyAllDeletionTombstones(
  snapshot: ClinicPersistedState
): ClinicPersistedState {
  const deletedPatientIds = unionTombstoneIds(snapshot.deletedPatientIds);
  const deletedDoctorIds = unionTombstoneIds(snapshot.deletedDoctorIds);
  const deletedAppointmentIds = unionTombstoneIds(snapshot.deletedAppointmentIds);
  const deletedMedicalRecordIds = unionTombstoneIds(snapshot.deletedMedicalRecordIds);
  const deletedTreatmentPlanIds = unionTombstoneIds(snapshot.deletedTreatmentPlanIds);
  const deletedWorkActIds = unionTombstoneIds(snapshot.deletedWorkActIds);
  const deletedServiceIds = unionTombstoneIds(snapshot.deletedServiceIds);
  const deletedLegalDocumentIds = unionTombstoneIds(snapshot.deletedLegalDocumentIds);

  let next = applyDeletedWorkActTombstones(
    applyDeletedServiceTombstones(
      applyDeletedLegalDocumentTombstones(
        {
          ...snapshot,
          deletedPatientIds,
          deletedDoctorIds,
          deletedAppointmentIds,
          deletedMedicalRecordIds,
          deletedTreatmentPlanIds,
          deletedWorkActIds,
          deletedServiceIds,
          deletedLegalDocumentIds,
        },
        deletedLegalDocumentIds
      ),
      deletedServiceIds
    ),
    deletedWorkActIds
  );

  const patientSet = new Set(deletedPatientIds);
  const doctorSet = new Set(deletedDoctorIds);
  const appointmentSet = new Set(deletedAppointmentIds);
  const medicalSet = new Set(deletedMedicalRecordIds);
  const planSet = new Set(deletedTreatmentPlanIds);

  const filterByPatient = <T extends { patientId?: string }>(rows: T[]) =>
    rows.filter((row) => !row.patientId || !patientSet.has(row.patientId));

  const teethByPatient = { ...next.teethByPatient };
  for (const id of deletedPatientIds) {
    delete teethByPatient[id];
  }

  next = {
    ...next,
    patients: next.patients.filter((p) => !patientSet.has(p.id)),
    doctors: next.doctors.filter((d) => !doctorSet.has(d.id)),
    doctorSchedules: (next.doctorSchedules ?? []).filter(
      (sch) => !doctorSet.has(sch.doctorId)
    ),
    cabinets: next.cabinets.map((c) => ({
      ...c,
      staffIds: (c.staffIds ?? []).filter((sid) => !doctorSet.has(sid)),
    })),
    appointments: next.appointments
      .filter((a) => !appointmentSet.has(a.id) && !patientSet.has(a.patientId))
      .map((a) => {
        let row = a;
        if (row.doctorId && doctorSet.has(row.doctorId)) {
          row = { ...row, doctorId: undefined };
        }
        if (row.assistantId && doctorSet.has(row.assistantId)) {
          row = { ...row, assistantId: undefined, assistantHours: undefined };
        }
        return row;
      }),
    medicalRecords: next.medicalRecords.filter(
      (r) => !medicalSet.has(r.id) && !patientSet.has(r.patientId)
    ),
    treatmentPlans: next.treatmentPlans.filter(
      (p) => !planSet.has(p.id) && !patientSet.has(p.patientId)
    ),
    payments: filterByPatient(next.payments),
    invoices: filterByPatient(next.invoices),
    workActs: filterByPatient(next.workActs).map((act) =>
      act.doctorId && doctorSet.has(act.doctorId)
        ? { ...act, doctorId: undefined }
        : act
    ),
    prepayments: filterByPatient(next.prepayments),
    patientFiles: filterByPatient(next.patientFiles),
    patientNotes: filterByPatient(next.patientNotes),
    teethByPatient,
    assistantManualHours: Object.fromEntries(
      Object.entries(next.assistantManualHours ?? {}).filter(
        ([staffId]) => !doctorSet.has(staffId)
      )
    ),
  };

  return repairFinancialCoupling(next);
}

function withMergedTombstoneIds(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState,
  merged: ClinicPersistedState
): ClinicPersistedState {
  return applyAllDeletionTombstones({
    ...merged,
    deletedPatientIds: unionTombstoneIds(
      existing.deletedPatientIds,
      incoming.deletedPatientIds,
      merged.deletedPatientIds
    ),
    deletedDoctorIds: unionTombstoneIds(
      existing.deletedDoctorIds,
      incoming.deletedDoctorIds,
      merged.deletedDoctorIds
    ),
    deletedAppointmentIds: unionTombstoneIds(
      existing.deletedAppointmentIds,
      incoming.deletedAppointmentIds,
      merged.deletedAppointmentIds
    ),
    deletedMedicalRecordIds: unionTombstoneIds(
      existing.deletedMedicalRecordIds,
      incoming.deletedMedicalRecordIds,
      merged.deletedMedicalRecordIds
    ),
    deletedTreatmentPlanIds: unionTombstoneIds(
      existing.deletedTreatmentPlanIds,
      incoming.deletedTreatmentPlanIds,
      merged.deletedTreatmentPlanIds
    ),
    deletedWorkActIds: unionTombstoneIds(
      existing.deletedWorkActIds,
      incoming.deletedWorkActIds,
      merged.deletedWorkActIds
    ),
    deletedServiceIds: unionTombstoneIds(
      existing.deletedServiceIds,
      incoming.deletedServiceIds,
      merged.deletedServiceIds
    ),
    deletedLegalDocumentIds: unionTombstoneIds(
      existing.deletedLegalDocumentIds,
      incoming.deletedLegalDocumentIds,
      merged.deletedLegalDocumentIds
    ),
  });
}

/** mergeByIdPreferLocal с учётом удалений в local (после reload / до автосохранения) */
export function mergeByIdPreferLocalRespectingDeletions<T extends { id: string }>(
  remote: T[],
  local: T[]
): T[] {
  if (!hasEntityListDeletion(remote, local)) {
    return mergeByIdPreferLocal(remote, local);
  }
  const localIds = new Set(local.map((x) => x.id));
  return mergeByIdPreferLocal(
    remote.filter((x) => localIds.has(x.id)),
    local
  );
}

/**
 * Гонка PUT: server — актуальный снимок, client — устаревший.
 * Совпадающие id: поля с сервера; новые id клиента сохраняем;
 * явные удаления в client не восстанавливаем с сервера.
 */
export function mergeByIdPreferServerRespectingClientDeletions<T extends { id: string }>(
  server: T[],
  client: T[]
): T[] {
  if (hasEntityListDeletion(server, client)) {
    const clientIds = new Set(client.map((x) => x.id));
    const serverKept = server.filter((x) => clientIds.has(x.id));
    return mergeByIdPreferLocal(client, serverKept);
  }
  return mergeByIdPreferLocal(client, server);
}

/**
 * Записи при CAS-конфликте: обычно server wins (иначе stale PUT откатывает статус).
 * Исключение: клиент уже отправил акт (ready_for_payment + workActId) — не теряем это,
 * пока сервер ещё на старом статусе.
 */
export function mergeAppointmentsOnWriteConflict(
  server: Appointment[],
  client: Appointment[]
): Appointment[] {
  const base = mergeByIdPreferServerRespectingClientDeletions(server, client);
  const serverById = new Map(server.map((a) => [a.id, a]));
  const clientById = new Map(client.map((a) => [a.id, a]));
  return base.map((row) => {
    const s = serverById.get(row.id);
    const c = clientById.get(row.id);
    if (!s || !c) return row;
    if (
      c.status === "ready_for_payment" &&
      c.workActId &&
      s.status !== "ready_for_payment"
    ) {
      return {
        ...s,
        status: "ready_for_payment",
        workActId: c.workActId,
        paymentStatus: c.paymentStatus ?? s.paymentStatus,
      };
    }
    return row;
  });
}

export function doctorScheduleKey(schedule: DoctorMonthSchedule): string {
  return `${schedule.doctorId}:${schedule.month}`;
}

function pickNewerDoctorSchedule(
  current: DoctorMonthSchedule | undefined,
  next: DoctorMonthSchedule
): DoctorMonthSchedule {
  if (!current) return next;
  const curAt = current.updatedAt ?? "";
  const nextAt = next.updatedAt ?? "";
  return nextAt >= curAt ? next : current;
}

/** Графики врачей: ключ doctorId + month; при конфликте — более свежий updatedAt */
export function mergeDoctorSchedules(
  remote: DoctorMonthSchedule[],
  local: DoctorMonthSchedule[]
): DoctorMonthSchedule[] {
  const map = new Map<string, DoctorMonthSchedule>();
  for (const x of remote) {
    map.set(doctorScheduleKey(x), pickNewerDoctorSchedule(map.get(doctorScheduleKey(x)), x));
  }
  for (const x of local) {
    map.set(doctorScheduleKey(x), pickNewerDoctorSchedule(map.get(doctorScheduleKey(x)), x));
  }
  return Array.from(map.values());
}

/** Пациенты из текущей сессии не затираются устаревшим remote-снимком */
export function mergeClinicPatients(remote: Patient[], local: Patient[]): Patient[] {
  return mergePatientsPreferLocalPreservePhi(remote, local);
}

const MASS_ENTITY_LOSS_MIN_EXISTING = 4;
const MASS_ENTITY_LOSS_RATIO = 0.75;

/** Резкое уменьение списка при том же наборе id — чаще битая синхронизация, чем удаление */
export function isLikelyAccidentalMassEntityLoss<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): boolean {
  if (!isDeletionOnlySubset(existing, incoming)) return false;
  if (incoming.length >= existing.length) return false;
  return (
    existing.length >= MASS_ENTITY_LOSS_MIN_EXISTING &&
    incoming.length < existing.length * MASS_ENTITY_LOSS_RATIO
  );
}

/** @deprecated */
export function isLikelyAccidentalMassPatientLoss(
  existing: Patient[],
  incoming: Patient[]
): boolean {
  return isLikelyAccidentalMassEntityLoss(existing, incoming);
}

/** После merge с сервером появились локальные записи, которых не было в remote */
export function hasSnapshotRecoveryFromMerge(
  remote: ClinicPersistedState,
  merged: ClinicPersistedState
): boolean {
  const countIds = <T extends { id: string }>(items: T[]) => new Set(items.map((x) => x.id));
  const remotePatientIds = countIds(remote.patients);
  if (merged.patients.some((p) => !remotePatientIds.has(p.id))) return true;

  const arrays: Array<keyof Pick<
    ClinicPersistedState,
    | "appointments"
    | "medicalRecords"
    | "treatmentPlans"
    | "payments"
    | "workActs"
    | "patientNotes"
    | "patientFiles"
    | "legalDocuments"
    | "clinicExpenses"
  >> = [
    "appointments",
    "medicalRecords",
    "treatmentPlans",
    "payments",
    "workActs",
    "patientNotes",
    "patientFiles",
    "legalDocuments",
    "clinicExpenses",
  ];

  for (const key of arrays) {
    const remoteIds = countIds(remote[key] as { id: string }[]);
    const mergedArr = merged[key] as { id: string }[];
    if (mergedArr.some((x) => !remoteIds.has(x.id))) return true;
  }

  const remoteTeethKeys = new Set(Object.keys(remote.teethByPatient));
  if (Object.keys(merged.teethByPatient).some((k) => !remoteTeethKeys.has(k))) return true;

  return false;
}

/** Быстрое сравнение снимков без полного JSON.stringify (не блокирует UI) */
export function clinicSnapshotsDifferQuickly(
  remote: ClinicPersistedState,
  merged: ClinicPersistedState
): boolean {
  const countKeys = [
    "patients",
    "appointments",
    "medicalRecords",
    "treatmentPlans",
    "payments",
    "workActs",
    "doctors",
    "services",
  ] as const;
  for (const key of countKeys) {
    if (remote[key].length !== merged[key].length) return true;
  }
  if (merged.actCounter !== remote.actCounter) return true;
  if (
    Object.keys(merged.teethByPatient).length !== Object.keys(remote.teethByPatient).length
  ) {
    return true;
  }
  return false;
}

/** @deprecated используйте shouldPushSnapshotAfterServerFetch */
export function shouldPushMergedSnapshotAfterLoad(
  remote: ClinicPersistedState,
  merged: ClinicPersistedState,
  options?: { hasPendingBuffer?: boolean }
): boolean {
  if (options?.hasPendingBuffer) return true;
  return hasSnapshotRecoveryFromMerge(remote, merged);
}

function mergeEntityArraysForSave<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  options?: { protectMassLoss?: boolean }
): T[] {
  if (!isDeletionOnlySubset(existing, incoming)) {
    return mergeByIdPreferLocal(existing, incoming);
  }
  if (incoming.length > existing.length) return incoming;
  if (options?.protectMassLoss && isLikelyAccidentalMassEntityLoss(existing, incoming)) {
    return mergeByIdPreferLocal(existing, incoming);
  }
  return incoming;
}

/** Акты/оплаты: пустой устаревший снимок не должен обнулять финансы на сервере */
function mergeFinancialArraysForSave<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  options?: { allowClear?: boolean }
): T[] {
  if (!options?.allowClear && incoming.length === 0 && existing.length > 0) {
    return existing;
  }
  return mergeEntityArraysForSave(existing, incoming, { protectMassLoss: true });
}

/** Убрать платежи/счета по удалённым актам после merge или удаления. */
export function repairFinancialCoupling(
  snapshot: ClinicPersistedState
): ClinicPersistedState {
  const actIds = new Set(snapshot.workActs.map((a) => a.id));
  return {
    ...snapshot,
    payments: filterPaymentsWithExistingWorkActs(snapshot.payments, snapshot.workActs),
    invoices: snapshot.invoices.filter(
      (inv) => !inv.workActId || actIds.has(inv.workActId)
    ),
  };
}

/** merge с сервера: новые акты/оплаты с другого устройства не отбрасываются */
function mergeFinancialEntityList<T extends { id: string }>(client: T[], server: T[]): T[] {
  const clientIds = new Set(client.map((x) => x.id));
  const serverIds = new Set(server.map((x) => x.id));
  const clientHasNewRows = hasEntityIdsNotInIncoming(client, server);
  const serverHasRowsMissingOnClient = server.some((x) => !clientIds.has(x.id));
  const localDeletedRows =
    client.length > 0 && hasEntityListDeletion(client, server);
  const idsOverlap = client.some((x) => serverIds.has(x.id));

  // Замена акта (новый id вместо старого) — не поднимать старые строки с сервера.
  if (clientHasNewRows && serverHasRowsMissingOnClient && !idsOverlap) {
    return client;
  }

  // local (server) удалил строки — не поднимать их с remote (client); remote-only — новые с другого устройства
  if (localDeletedRows) {
    const merged = mergeByIdPreferLocal(
      client.filter((x) => serverIds.has(x.id)),
      server
    );
    const remoteOnly = client.filter((x) => !serverIds.has(x.id));
    return remoteOnly.length ? mergeByIdPreferLocal(remoteOnly, merged) : merged;
  }

  if (clientHasNewRows) {
    return mergeByIdPreferLocal(client, server);
  }

  if (serverHasRowsMissingOnClient) {
    return mergeByIdPreferLocal(server, client);
  }

  return mergeByIdPreferLocalRespectingDeletions(client, server);
}

/** Слияние remote + local перед hydrate (загрузка с сервера) */
export function mergeClinicSnapshotWithLocal(
  remote: ClinicPersistedState,
  local: ClinicPersistedState
): ClinicPersistedState {
  const patientsMerged = mergeEntityListWithTombstones(
    remote.patients,
    local.patients,
    remote.deletedPatientIds,
    local.deletedPatientIds
  );
  const patients = {
    ...patientsMerged,
    items: mergePatientsPreferLocalPreservePhi(remote.patients, patientsMerged.items),
  };
  const doctors = mergeEntityListWithTombstones(
    remote.doctors,
    local.doctors,
    remote.deletedDoctorIds,
    local.deletedDoctorIds
  );
  // Записи: сервер побеждает по общим id (command API / статусы с другого устройства),
  // локальные ещё не попавшие на сервер — сохраняем.
  const appointments = mergeEntityListWithTombstones(
    (() => {
      const remoteIds = new Set(remote.appointments.map((a) => a.id));
      const localOnly = local.appointments.filter((a) => !remoteIds.has(a.id));
      return localOnly.length
        ? [...remote.appointments, ...localOnly]
        : remote.appointments;
    })(),
    [],
    remote.deletedAppointmentIds,
    local.deletedAppointmentIds
  );
  const medicalRecords = mergeEntityListWithTombstones(
    mergeByIdPreferLocalRespectingDeletions(remote.medicalRecords, local.medicalRecords),
    [],
    remote.deletedMedicalRecordIds,
    local.deletedMedicalRecordIds
  );
  const treatmentPlans = mergeEntityListWithTombstones(
    mergeByIdPreferLocalRespectingDeletions(remote.treatmentPlans, local.treatmentPlans),
    [],
    remote.deletedTreatmentPlanIds,
    local.deletedTreatmentPlanIds
  );

  const merged: ClinicPersistedState = {
    ...remote,
    doctors: doctors.items,
    deletedDoctorIds: doctors.deletedIds,
    ...(() => {
      const services = mergeServicesState(
        remote.services,
        local.services,
        remote.deletedServiceIds,
        local.deletedServiceIds
      );
      return {
        services: services.services,
        deletedServiceIds: services.deletedServiceIds,
      };
    })(),
    cabinets: mergeByIdPreferLocal(remote.cabinets, local.cabinets),
    patients: patients.items,
    deletedPatientIds: patients.deletedIds,
    appointments: appointments.items,
    deletedAppointmentIds: appointments.deletedIds,
    medicalRecords: medicalRecords.items,
    deletedMedicalRecordIds: medicalRecords.deletedIds,
    treatmentPlans: treatmentPlans.items,
    deletedTreatmentPlanIds: treatmentPlans.deletedIds,
    payments: mergeFinancialEntityList(remote.payments, local.payments),
    invoices: mergeFinancialEntityList(remote.invoices, local.invoices),
    ...(() => {
      const acts = mergeWorkActsState(
        remote.workActs,
        local.workActs,
        remote.deletedWorkActIds,
        local.deletedWorkActIds
      );
      return {
        workActs: acts.workActs,
        deletedWorkActIds: acts.deletedWorkActIds,
      };
    })(),
    warehouse: mergeByIdPreferLocalRespectingDeletions(remote.warehouse, local.warehouse),
    tasks: mergeByIdPreferLocalRespectingDeletions(remote.tasks, local.tasks),
    onlineBookings: mergeByIdPreferLocalRespectingDeletions(
      remote.onlineBookings,
      local.onlineBookings
    ),
    patientFiles: mergeByIdPreferLocalRespectingDeletions(
      remote.patientFiles,
      local.patientFiles
    ),
    patientNotes: mergeByIdPreferLocalRespectingDeletions(
      remote.patientNotes,
      local.patientNotes
    ),
    documentTemplates: mergeByIdPreferLocal(
      remote.documentTemplates,
      local.documentTemplates
    ),
    clinicExpenses: mergeFinancialEntityList(
      remote.clinicExpenses,
      local.clinicExpenses
    ),
    ...(() => {
      const legal = mergeLegalDocumentsState(
        remote.legalDocuments,
        local.legalDocuments,
        remote.deletedLegalDocumentIds,
        local.deletedLegalDocumentIds
      );
      return {
        legalDocuments: legal.legalDocuments,
        deletedLegalDocumentIds: legal.deletedLegalDocumentIds,
      };
    })(),
    doctorSchedules: mergeDoctorSchedules(remote.doctorSchedules, local.doctorSchedules),
    prepayments: mergeByIdPreferLocalRespectingDeletions(
      remote.prepayments,
      local.prepayments
    ),
    teethByPatient: { ...remote.teethByPatient, ...local.teethByPatient },
    actCounter: Math.max(remote.actCounter, local.actCounter),
    assistantManualHours: mergeAssistantManualHours(
      remote.assistantManualHours ?? {},
      local.assistantManualHours ?? {}
    ),
    clinicSettings: local.clinicSettings ?? remote.clinicSettings,
    userThemePreferences: {
      ...remote.userThemePreferences,
      ...local.userThemePreferences,
    },
  };

  return (() => {
    const withTombstones = withMergedTombstoneIds(remote, local, merged);
    const repaired = repairFinancialCoupling(withTombstones);
    const withActs = withUniqueWorkActNumbers(
      repaired,
      new Set(remote.workActs.map((a) => a.id))
    );
    if (!findOrphanPatientIds(withActs).length) return withActs;
    return repairMissingPatientsInSnapshot(withActs);
  })();
}

/** Перед записью в БД: не терять записи при урезанном снимке без явного удаления */
export function mergeClinicDataForSave(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState
): ClinicPersistedState {
  const mergeArr = <T extends { id: string }>(
    ex: T[],
    inc: T[],
    opts?: { protectMassLoss?: boolean }
  ) => mergeEntityArraysForSave(ex, inc, opts);
  const protect = { protectMassLoss: true as const };

  // Удаление пациента — только по явному tombstone (deletedPatientIds).
  // Absence во входящем snapshot ≠ delete: иначе устаревшая вкладка стирает
  // пациентов, созданных на другом устройстве.
  const deletedPatientIds = new Set<string>([
    ...(existing.deletedPatientIds ?? []),
    ...(incoming.deletedPatientIds ?? []),
  ]);
  const hasPatientDeletion = deletedPatientIds.size > 0;
  const doctorsMerged = mergeEntityListWithTombstones(
    existing.doctors,
    incoming.doctors,
    existing.deletedDoctorIds,
    incoming.deletedDoctorIds
  );
  const hasServiceDeletion = hasEntityListDeletion(existing.services, incoming.services);

  const merged: ClinicPersistedState = {
    ...incoming,
    doctors: doctorsMerged.items,
    deletedDoctorIds: doctorsMerged.deletedIds,
    ...(() => {
      const servicesState = mergeServicesState(
        existing.services,
        incoming.services,
        existing.deletedServiceIds,
        incoming.deletedServiceIds
      );
      return {
        services: mergeArr(
          existing.services,
          servicesState.services,
          hasServiceDeletion ? undefined : protect
        ),
        deletedServiceIds: servicesState.deletedServiceIds,
      };
    })(),
    cabinets: mergeArr(existing.cabinets, incoming.cabinets, protect),
    // Пациенты: server wins на обычном PUT.
    // Карточка пишется через /api/clinic/patients/update + replaceAppliedSnapshot
    // (без этого merge). Иначе вкладка с устаревшим ФИО и свежим CAS
    // (ack после pull) затирает только что сохранённую карточку без 409.
    patients: mergePatientsOnWriteConflict(existing.patients, incoming.patients),
    // Статусы/workActId пишутся command API; stale PUT не должен откатывать.
    appointments:
      incoming.appointments.length === 0 && existing.appointments.length > 0
        ? existing.appointments
        : mergeAppointmentsOnWriteConflict(existing.appointments, incoming.appointments),
    ...(() => {
      const deletedMedicalRecordIds = unionTombstoneIds(
        existing.deletedMedicalRecordIds,
        incoming.deletedMedicalRecordIds
      );
      const mrTombstones = new Set(deletedMedicalRecordIds);
      // Absence ≠ delete: only tombstones remove; overlapping ids → server wins.
      const medicalRecords = mergeByIdPreferLocal(
        incoming.medicalRecords,
        existing.medicalRecords
      ).filter((r) => !mrTombstones.has(r.id));
      return { medicalRecords, deletedMedicalRecordIds };
    })(),
    ...(() => {
      const deletedTreatmentPlanIds = unionTombstoneIds(
        existing.deletedTreatmentPlanIds,
        incoming.deletedTreatmentPlanIds
      );
      const planTombstones = new Set(deletedTreatmentPlanIds);
      const plans = mergeByIdPreferLocal(
        incoming.treatmentPlans,
        existing.treatmentPlans
      ).filter((p) => !planTombstones.has(p.id));
      return {
        treatmentPlans: plans,
        deletedTreatmentPlanIds,
      };
    })(),
    // Пересекающиеся id: server wins (оплата/акт с command API);
    // новые id клиента принимаем; пустой incoming не обнуляет финансы.
    payments:
      incoming.payments.length === 0 && existing.payments.length > 0
        ? existing.payments
        : mergeByIdPreferServerRespectingClientDeletions(
            existing.payments,
            incoming.payments
          ),
    invoices:
      incoming.invoices.length === 0 && existing.invoices.length > 0
        ? existing.invoices
        : mergeByIdPreferServerRespectingClientDeletions(
            existing.invoices,
            incoming.invoices
          ),
    ...(() => {
      const deletedWorkActIds = unionTombstoneIds(
        existing.deletedWorkActIds,
        incoming.deletedWorkActIds
      );
      const tombstoneSet = new Set(deletedWorkActIds);
      const workActsBase =
        incoming.workActs.length === 0 && existing.workActs.length > 0
          ? existing.workActs
          : mergeByIdPreferServerRespectingClientDeletions(
              existing.workActs,
              incoming.workActs
            );
      return {
        workActs: workActsBase.filter((act) => !tombstoneSet.has(act.id)),
        deletedWorkActIds,
      };
    })(),
    warehouse: mergeArr(existing.warehouse, incoming.warehouse, protect),
    tasks: mergeArr(existing.tasks, incoming.tasks, protect),
    onlineBookings: mergeArr(existing.onlineBookings, incoming.onlineBookings, protect),
    patientFiles: mergeArr(
      existing.patientFiles,
      incoming.patientFiles,
      hasPatientDeletion ? undefined : protect
    ),
    // Заметки: server wins на пересечении; новые с клиента принимаем; absence ≠ delete.
    patientNotes: mergeByIdPreferLocal(incoming.patientNotes, existing.patientNotes),
    documentTemplates: mergeArr(existing.documentTemplates, incoming.documentTemplates, protect),
    clinicExpenses: mergeArr(existing.clinicExpenses, incoming.clinicExpenses, protect),
    ...(() => {
      const legal = mergeLegalDocumentsState(
        existing.legalDocuments,
        incoming.legalDocuments,
        existing.deletedLegalDocumentIds,
        incoming.deletedLegalDocumentIds
      );
      return {
        legalDocuments: legal.legalDocuments,
        deletedLegalDocumentIds: legal.deletedLegalDocumentIds,
      };
    })(),
    doctorSchedules: mergeDoctorSchedules(existing.doctorSchedules, incoming.doctorSchedules),
    prepayments: mergeByIdPreferLocal(
      incoming.prepayments ?? [],
      existing.prepayments ?? []
    ),
    teethByPatient: { ...existing.teethByPatient, ...incoming.teethByPatient },
    actCounter: Math.max(existing.actCounter, incoming.actCounter),
    assistantManualHours: mergeAssistantManualHours(
      existing.assistantManualHours ?? {},
      incoming.assistantManualHours ?? {}
    ),
  };

  if (!hasPatientDeletion) {
    return withMergedTombstoneIds(
      existing,
      incoming,
      withUniqueWorkActNumbers(
        repairFinancialCoupling(repairMissingPatientsInSnapshot(merged)),
        new Set(existing.workActs.map((a) => a.id))
      )
    );
  }

  // Жёстко применяем удаление пациента ко всем зависимым сущностям и зубам.
  const filterByPatient = <T extends { patientId?: string }>(rows: T[]) =>
    rows.filter((r) => !r.patientId || !deletedPatientIds.has(r.patientId));
  const { teethByPatient } = merged;
  const nextTeeth: Record<string, ToothRecord[]> = { ...teethByPatient };
  for (const id of deletedPatientIds) {
    delete nextTeeth[id];
  }

  return withMergedTombstoneIds(
    existing,
    incoming,
    withUniqueWorkActNumbers(
      repairFinancialCoupling(
        repairMissingPatientsInSnapshot({
          ...merged,
          deletedPatientIds: [...deletedPatientIds],
          patients: merged.patients.filter((p) => !deletedPatientIds.has(p.id)),
          appointments: filterByPatient(merged.appointments),
          medicalRecords: filterByPatient(merged.medicalRecords),
          treatmentPlans: filterByPatient(merged.treatmentPlans),
          payments: filterByPatient(merged.payments),
          invoices: filterByPatient(merged.invoices),
          workActs: filterByPatient(merged.workActs),
          prepayments: filterByPatient(merged.prepayments),
          patientFiles: filterByPatient(merged.patientFiles),
          patientNotes: filterByPatient(merged.patientNotes),
          teethByPatient: nextTeeth,
        })
      ),
      new Set(existing.workActs.map((a) => a.id))
    )
  );
}

/**
 * Гонка PUT: на сервере уже более свежий снимок.
 * Новые id из клиента сохраняем, для совпадающих id — приоритет у сервера.
 */
export function mergeClinicDataOnWriteConflict(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState
): ClinicPersistedState {
  const preferServer = <T extends { id: string }>(server: T[], client: T[]) =>
    mergeByIdPreferServerRespectingClientDeletions(server, client);

  // Только explicit tombstones — иначе stale client «удаляет» чужие creates.
  const deletedPatientIds = new Set<string>([
    ...(existing.deletedPatientIds ?? []),
    ...(incoming.deletedPatientIds ?? []),
  ]);
  const hasPatientDeletion = deletedPatientIds.size > 0;
  const deletedDoctorIds = unionTombstoneIds(
    existing.deletedDoctorIds,
    incoming.deletedDoctorIds
  );
  const deletedDoctorSet = new Set(deletedDoctorIds);

  const merged: ClinicPersistedState = {
    ...incoming,
    doctors: preferServer(existing.doctors, incoming.doctors).filter(
      (d) => !deletedDoctorSet.has(d.id)
    ),
    deletedDoctorIds,
    ...(() => {
      const servicesState = mergeServicesState(
        existing.services,
        incoming.services,
        existing.deletedServiceIds,
        incoming.deletedServiceIds
      );
      return {
        services: preferServer(existing.services, servicesState.services),
        deletedServiceIds: servicesState.deletedServiceIds,
      };
    })(),
    cabinets: preferServer(existing.cabinets, incoming.cabinets),
    // Обычно server wins; автозаглушка «имя Уточните» уступает реальной карточке клиента.
    patients: mergePatientsOnWriteConflict(existing.patients, incoming.patients),
    appointments:
      incoming.appointments.length === 0 && existing.appointments.length > 0
        ? existing.appointments
        : mergeAppointmentsOnWriteConflict(existing.appointments, incoming.appointments),
    medicalRecords: preferServer(existing.medicalRecords, incoming.medicalRecords),
    treatmentPlans: preferServer(existing.treatmentPlans, incoming.treatmentPlans),
    payments: hasPatientDeletion
      ? preferServer(existing.payments, incoming.payments)
      : mergeFinancialArraysForSave(existing.payments, incoming.payments),
    invoices: hasPatientDeletion
      ? preferServer(existing.invoices, incoming.invoices)
      : mergeFinancialArraysForSave(existing.invoices, incoming.invoices),
    ...(() => {
      const deletedWorkActIds = unionTombstoneIds(
        existing.deletedWorkActIds,
        incoming.deletedWorkActIds
      );
      const tombstoneSet = new Set(deletedWorkActIds);
      const workActs = (
        hasPatientDeletion
          ? preferServer(existing.workActs, incoming.workActs)
          : mergeFinancialArraysForSave(existing.workActs, incoming.workActs)
      ).filter((act) => !tombstoneSet.has(act.id));
      return {
        workActs,
        deletedWorkActIds,
      };
    })(),
    warehouse: preferServer(existing.warehouse, incoming.warehouse),
    tasks: preferServer(existing.tasks, incoming.tasks),
    onlineBookings: preferServer(existing.onlineBookings, incoming.onlineBookings),
    patientFiles: preferServer(existing.patientFiles, incoming.patientFiles),
    patientNotes: preferServer(existing.patientNotes, incoming.patientNotes),
    documentTemplates: preferServer(existing.documentTemplates, incoming.documentTemplates),
    clinicExpenses: preferServer(existing.clinicExpenses, incoming.clinicExpenses),
    ...(() => {
      const legal = mergeLegalDocumentsState(
        existing.legalDocuments,
        incoming.legalDocuments,
        existing.deletedLegalDocumentIds,
        incoming.deletedLegalDocumentIds
      );
      return {
        legalDocuments: legal.legalDocuments,
        deletedLegalDocumentIds: legal.deletedLegalDocumentIds,
      };
    })(),
    prepayments: preferServer(existing.prepayments, incoming.prepayments),
    doctorSchedules: mergeDoctorSchedules(existing.doctorSchedules, incoming.doctorSchedules),
    teethByPatient: { ...existing.teethByPatient, ...incoming.teethByPatient },
    actCounter: Math.max(existing.actCounter, incoming.actCounter),
    assistantManualHours: mergeAssistantManualHours(
      existing.assistantManualHours ?? {},
      incoming.assistantManualHours ?? {}
    ),
    clinicSettings: incoming.clinicSettings ?? existing.clinicSettings,
    userThemePreferences: {
      ...incoming.userThemePreferences,
      ...existing.userThemePreferences,
    },
  };

  if (!hasPatientDeletion) {
    return withMergedTombstoneIds(
      existing,
      incoming,
      withUniqueWorkActNumbers(
        repairMissingPatientsInSnapshot(merged),
        new Set(existing.workActs.map((a) => a.id))
      )
    );
  }

  const filterByPatient = <T extends { patientId?: string }>(rows: T[]) =>
    rows.filter((r) => !r.patientId || !deletedPatientIds.has(r.patientId));
  const { teethByPatient } = merged;
  const nextTeeth: Record<string, ToothRecord[]> = { ...teethByPatient };
  for (const id of deletedPatientIds) {
    delete nextTeeth[id];
  }

  return withMergedTombstoneIds(
    existing,
    incoming,
    withUniqueWorkActNumbers(
      repairMissingPatientsInSnapshot({
        ...merged,
        deletedPatientIds: [...deletedPatientIds],
        patients: merged.patients.filter((p) => !deletedPatientIds.has(p.id)),
        appointments: filterByPatient(merged.appointments),
        medicalRecords: filterByPatient(merged.medicalRecords),
        treatmentPlans: filterByPatient(merged.treatmentPlans),
        payments: filterByPatient(merged.payments),
        invoices: filterByPatient(merged.invoices),
        workActs: filterByPatient(merged.workActs),
        prepayments: filterByPatient(merged.prepayments),
        patientFiles: filterByPatient(merged.patientFiles),
        patientNotes: filterByPatient(merged.patientNotes),
        teethByPatient: nextTeeth,
      }),
      new Set(existing.workActs.map((a) => a.id))
    )
  );
}

/**
 * Защита от случайной перезаписи урезанным снимком (битая синхронизация).
 * Не мешает удалять пациентов, врачей и отдельные услуги.
 */
export function isSuspiciousClinicDataDowngrade(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState
): boolean {
  if (!hasClinicData(existing)) return false;
  if (!hasClinicData(incoming)) {
    const hasDoctorDeletion =
      isDeletionOnlySubset(existing.doctors, incoming.doctors) &&
      incoming.doctors.length < existing.doctors.length;
    if (hasDoctorDeletion) return false;
    return true;
  }

  // Важный кейс: при удалении пациента может пропасть большая доля зависимых сущностей
  // (приёмы/акты/платежи/медкарта). Это легитимно и не должно блокироваться защитой.
  const hasPatientDeletion = hasEntityListDeletion(existing.patients, incoming.patients);
  const hasLegalDocumentDeletion = hasEntityListDeletion(
    existing.legalDocuments,
    incoming.legalDocuments
  );
  const hasServiceDeletion = hasEntityListDeletion(existing.services, incoming.services);
  const hasTreatmentPlanDeletion = hasEntityListDeletion(
    existing.treatmentPlans,
    incoming.treatmentPlans
  );

  const guarded: Array<{
    existing: { id: string }[];
    incoming: { id: string }[];
    protectMassLoss: boolean;
  }> = [
    { existing: existing.patients, incoming: incoming.patients, protectMassLoss: true },
    { existing: existing.doctors, incoming: incoming.doctors, protectMassLoss: true },
    {
      existing: existing.services,
      incoming: incoming.services,
      protectMassLoss: !hasServiceDeletion,
    },

    // Транзакционные сущности: защищаем от "обнуления" только если пациенты не удалялись.
    { existing: existing.appointments, incoming: incoming.appointments, protectMassLoss: !hasPatientDeletion },
    {
      existing: existing.medicalRecords,
      incoming: incoming.medicalRecords,
      protectMassLoss: !hasPatientDeletion,
    },
    {
      existing: existing.treatmentPlans,
      incoming: incoming.treatmentPlans,
      protectMassLoss: !hasPatientDeletion && !hasTreatmentPlanDeletion,
    },
    { existing: existing.payments, incoming: incoming.payments, protectMassLoss: !hasPatientDeletion },
    { existing: existing.workActs, incoming: incoming.workActs, protectMassLoss: !hasPatientDeletion },
    {
      existing: existing.legalDocuments,
      incoming: incoming.legalDocuments,
      protectMassLoss: !hasLegalDocumentDeletion,
    },
  ];

  for (const { existing: ex, incoming: inc, protectMassLoss } of guarded) {
    if (!isDeletionOnlySubset(ex, inc)) return true;
    if (protectMassLoss && isLikelyAccidentalMassEntityLoss(ex, inc)) return true;
  }

  if (patientsLostButAppointmentsRemain(existing, incoming)) return true;

  return false;
}

export function parseClinicPersistedState(raw: unknown): ClinicPersistedState | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.patients) || !Array.isArray(d.doctors)) return null;
  const fresh = createFreshPersistedState();
  return {
    ...fresh,
    ...(d as Partial<ClinicPersistedState>),
    doctors: (d.doctors as Doctor[]) ?? [],
    services: migrateServices((d.services as Service[]) ?? []),
    cabinets: (d.cabinets as Cabinet[]) ?? [],
    patients: (d.patients as Patient[]) ?? [],
    appointments: (d.appointments as Appointment[]) ?? [],
    medicalRecords: (d.medicalRecords as MedicalRecord[]) ?? [],
    treatmentPlans: (d.treatmentPlans as TreatmentPlan[]) ?? [],
    payments: (d.payments as Payment[]) ?? [],
    invoices: (d.invoices as Invoice[]) ?? [],
    workActs: (d.workActs as WorkAct[]) ?? [],
    actCounter: typeof d.actCounter === "number" ? d.actCounter : 1,
    warehouse: (d.warehouse as WarehouseItem[]) ?? [],
    tasks: (d.tasks as Task[]) ?? [],
    onlineBookings: (d.onlineBookings as OnlineBookingRequest[]) ?? [],
    patientFiles: sanitizePatientFiles((d.patientFiles as PatientFile[]) ?? []),
    patientNotes: (d.patientNotes as PatientNote[]) ?? [],
    teethByPatient: (d.teethByPatient as Record<string, ToothRecord[]>) ?? {},
    clinicSettings: (d.clinicSettings as ClinicSettings) ?? fresh.clinicSettings,
    documentTemplates: (d.documentTemplates as ClinicDocumentTemplate[]) ?? [],
    clinicExpenses: sanitizeClinicExpenses((d.clinicExpenses as ClinicExpense[]) ?? []),
    legalDocuments: sanitizeLegalDocuments((d.legalDocuments as LegalDocument[]) ?? []),
    deletedLegalDocumentIds: Array.isArray(d.deletedLegalDocumentIds)
      ? (d.deletedLegalDocumentIds as string[])
      : [],
    deletedServiceIds: Array.isArray(d.deletedServiceIds)
      ? (d.deletedServiceIds as string[])
      : [],
    deletedWorkActIds: Array.isArray(d.deletedWorkActIds)
      ? (d.deletedWorkActIds as string[])
      : [],
    deletedPatientIds: Array.isArray(d.deletedPatientIds)
      ? (d.deletedPatientIds as string[])
      : [],
    deletedDoctorIds: Array.isArray(d.deletedDoctorIds)
      ? (d.deletedDoctorIds as string[])
      : [],
    deletedAppointmentIds: Array.isArray(d.deletedAppointmentIds)
      ? (d.deletedAppointmentIds as string[])
      : [],
    deletedMedicalRecordIds: Array.isArray(d.deletedMedicalRecordIds)
      ? (d.deletedMedicalRecordIds as string[])
      : [],
    deletedTreatmentPlanIds: Array.isArray(d.deletedTreatmentPlanIds)
      ? (d.deletedTreatmentPlanIds as string[])
      : [],
    doctorSchedules: (d.doctorSchedules as DoctorMonthSchedule[]) ?? [],
    prepayments: (d.prepayments as PatientPrepayment[]) ?? [],
    userThemePreferences: (d.userThemePreferences as Record<string, ThemeMode>) ?? {},
    assistantManualHours: normalizeAssistantManualHours(d.assistantManualHours),
  };
}
