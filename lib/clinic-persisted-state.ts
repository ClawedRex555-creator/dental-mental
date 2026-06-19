import { mergeClinicServices, migrateServices } from "@/lib/service-categories";
import {
  findOrphanPatientIds,
  patientsLostButAppointmentsRemain,
  repairMissingPatientsInSnapshot,
} from "@/lib/patient-visits";
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
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  userThemePreferences: Record<string, ThemeMode>;
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
    doctorSchedules: [],
    prepayments: [],
    userThemePreferences: {},
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
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  userThemePreferences: Record<string, ThemeMode>;
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
    clinicExpenses: state.clinicExpenses ?? [],
    legalDocuments: sanitizeLegalDocuments(state.legalDocuments ?? []),
    doctorSchedules: state.doctorSchedules ?? [],
    prepayments: state.prepayments ?? [],
    userThemePreferences: state.userThemePreferences ?? {},
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
    state.medicalRecords.length > 0
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

/** Объединение по id: записи из local (вторая коллекция) перекрывают remote */
export function mergeByIdPreferLocal<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const x of remote) map.set(x.id, x);
  for (const x of local) map.set(x.id, x);
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

export function doctorScheduleKey(schedule: DoctorMonthSchedule): string {
  return `${schedule.doctorId}:${schedule.month}`;
}

/** Графики врачей: ключ doctorId + month (без поля id) */
export function mergeDoctorSchedules(
  remote: DoctorMonthSchedule[],
  local: DoctorMonthSchedule[]
): DoctorMonthSchedule[] {
  const map = new Map<string, DoctorMonthSchedule>();
  for (const x of remote) map.set(doctorScheduleKey(x), x);
  for (const x of local) map.set(doctorScheduleKey(x), x);
  return Array.from(map.values());
}

/** Пациенты из текущей сессии не затираются устаревшим remote-снимком */
export function mergeClinicPatients(remote: Patient[], local: Patient[]): Patient[] {
  return mergeByIdPreferLocal(remote, local);
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
  >> = [
    "appointments",
    "medicalRecords",
    "treatmentPlans",
    "payments",
    "workActs",
    "patientNotes",
    "patientFiles",
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

/** Слияние remote + local перед hydrate (загрузка с сервера) */
export function mergeClinicSnapshotWithLocal(
  remote: ClinicPersistedState,
  local: ClinicPersistedState
): ClinicPersistedState {
  const merged: ClinicPersistedState = {
    ...remote,
    doctors: mergeByIdPreferLocal(remote.doctors, local.doctors),
    services: mergeClinicServices(remote.services, local.services),
    cabinets: mergeByIdPreferLocal(remote.cabinets, local.cabinets),
    patients: mergeClinicPatients(remote.patients, local.patients),
    appointments: mergeByIdPreferLocalRespectingDeletions(
      remote.appointments,
      local.appointments
    ),
    medicalRecords: mergeByIdPreferLocalRespectingDeletions(
      remote.medicalRecords,
      local.medicalRecords
    ),
    treatmentPlans: mergeByIdPreferLocalRespectingDeletions(
      remote.treatmentPlans,
      local.treatmentPlans
    ),
    payments: mergeByIdPreferLocalRespectingDeletions(remote.payments, local.payments),
    invoices: mergeByIdPreferLocalRespectingDeletions(remote.invoices, local.invoices),
    workActs: mergeByIdPreferLocalRespectingDeletions(remote.workActs, local.workActs),
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
    teethByPatient: { ...remote.teethByPatient, ...local.teethByPatient },
    documentTemplates: mergeByIdPreferLocalRespectingDeletions(
      remote.documentTemplates,
      local.documentTemplates
    ),
    clinicExpenses: mergeByIdPreferLocalRespectingDeletions(
      remote.clinicExpenses,
      local.clinicExpenses
    ),
    legalDocuments: mergeByIdPreferLocalRespectingDeletions(
      remote.legalDocuments,
      local.legalDocuments
    ),
    doctorSchedules: mergeDoctorSchedules(remote.doctorSchedules, local.doctorSchedules),
    prepayments: mergeByIdPreferLocalRespectingDeletions(
      remote.prepayments,
      local.prepayments
    ),
    actCounter: Math.max(remote.actCounter, local.actCounter),
    clinicSettings: local.clinicSettings ?? remote.clinicSettings,
    userThemePreferences: {
      ...remote.userThemePreferences,
      ...local.userThemePreferences,
    },
  };
  if (!findOrphanPatientIds(merged).length) return merged;
  return repairMissingPatientsInSnapshot(merged);
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

  // Если пользователь удалил пациента через UI, вместе с ним легитимно удаляются
  // связанные сущности (приёмы/акты/платежи/медкарта и т.д.). Такие удаления нельзя
  // "восстанавливать" защитой от массовой потери — иначе появятся заглушки.
  const existingPatientIds = new Set(existing.patients.map((p) => p.id));
  const incomingPatientIds = new Set(incoming.patients.map((p) => p.id));
  const deletedPatientIds = new Set<string>();
  for (const id of existingPatientIds) {
    if (!incomingPatientIds.has(id)) deletedPatientIds.add(id);
  }
  const hasPatientDeletion = deletedPatientIds.size > 0;
  const hasLegalDocumentDeletion = hasEntityListDeletion(
    existing.legalDocuments,
    incoming.legalDocuments
  );
  const hasServiceDeletion = hasEntityListDeletion(existing.services, incoming.services);
  const hasMedicalRecordDeletion = hasEntityListDeletion(
    existing.medicalRecords,
    incoming.medicalRecords
  );
  const hasTreatmentPlanDeletion = hasEntityListDeletion(
    existing.treatmentPlans,
    incoming.treatmentPlans
  );

  const merged: ClinicPersistedState = {
    ...incoming,
    doctors: mergeArr(existing.doctors, incoming.doctors, protect),
    services: mergeArr(
      existing.services,
      incoming.services,
      hasServiceDeletion ? undefined : protect
    ),
    cabinets: mergeArr(existing.cabinets, incoming.cabinets, protect),
    patients: mergeArr(existing.patients, incoming.patients, protect),
    appointments: mergeArr(
      existing.appointments,
      incoming.appointments,
      hasPatientDeletion ? undefined : protect
    ),
    medicalRecords: mergeArr(
      existing.medicalRecords,
      incoming.medicalRecords,
      hasPatientDeletion || hasMedicalRecordDeletion ? undefined : protect
    ),
    treatmentPlans: mergeArr(
      existing.treatmentPlans,
      incoming.treatmentPlans,
      hasPatientDeletion || hasTreatmentPlanDeletion ? undefined : protect
    ),
    payments: mergeArr(existing.payments, incoming.payments, hasPatientDeletion ? undefined : protect),
    invoices: mergeArr(existing.invoices, incoming.invoices, hasPatientDeletion ? undefined : protect),
    workActs: mergeArr(existing.workActs, incoming.workActs, hasPatientDeletion ? undefined : protect),
    warehouse: mergeArr(existing.warehouse, incoming.warehouse, protect),
    tasks: mergeArr(existing.tasks, incoming.tasks, protect),
    onlineBookings: mergeArr(existing.onlineBookings, incoming.onlineBookings, protect),
    patientFiles: mergeArr(
      existing.patientFiles,
      incoming.patientFiles,
      hasPatientDeletion ? undefined : protect
    ),
    patientNotes: mergeArr(
      existing.patientNotes,
      incoming.patientNotes,
      hasPatientDeletion ? undefined : protect
    ),
    documentTemplates: mergeArr(existing.documentTemplates, incoming.documentTemplates, protect),
    clinicExpenses: mergeArr(existing.clinicExpenses, incoming.clinicExpenses, protect),
    legalDocuments: mergeArr(
      existing.legalDocuments,
      incoming.legalDocuments,
      hasLegalDocumentDeletion ? undefined : protect
    ),
    doctorSchedules: mergeDoctorSchedules(existing.doctorSchedules, incoming.doctorSchedules),
    prepayments: mergeArr(
      existing.prepayments,
      incoming.prepayments,
      hasPatientDeletion ? undefined : protect
    ),
    teethByPatient: { ...existing.teethByPatient, ...incoming.teethByPatient },
    actCounter: Math.max(existing.actCounter, incoming.actCounter),
  };

  if (!hasPatientDeletion) {
    return repairMissingPatientsInSnapshot(merged);
  }

  // Жёстко применяем удаление пациента ко всем зависимым сущностям и зубам.
  const filterByPatient = <T extends { patientId?: string }>(rows: T[]) =>
    rows.filter((r) => !r.patientId || !deletedPatientIds.has(r.patientId));
  const { teethByPatient } = merged;
  const nextTeeth: Record<string, ToothRecord[]> = { ...teethByPatient };
  for (const id of deletedPatientIds) {
    delete nextTeeth[id];
  }

  return repairMissingPatientsInSnapshot({
    ...merged,
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
  });
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
  const hasMedicalRecordDeletion = hasEntityListDeletion(
    existing.medicalRecords,
    incoming.medicalRecords
  );
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
      protectMassLoss: !hasPatientDeletion && !hasMedicalRecordDeletion,
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
    clinicExpenses: (d.clinicExpenses as ClinicExpense[]) ?? [],
    legalDocuments: sanitizeLegalDocuments((d.legalDocuments as LegalDocument[]) ?? []),
    doctorSchedules: (d.doctorSchedules as DoctorMonthSchedule[]) ?? [],
    prepayments: (d.prepayments as PatientPrepayment[]) ?? [],
    userThemePreferences: (d.userThemePreferences as Record<string, ThemeMode>) ?? {},
  };
}
