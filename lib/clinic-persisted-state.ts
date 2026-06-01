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
  state: PersistPickSource
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
    services: state.services ?? [],
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

/** Есть ли в снимке реальные данные клиники (не пустой шаблон) */
export function hasClinicData(state: ClinicPersistedState): boolean {
  return (
    state.patients.length > 0 ||
    state.doctors.length > 0 ||
    state.appointments.length > 0 ||
    state.workActs.length > 0 ||
    state.payments.length > 0 ||
    state.treatmentPlans.length > 0
  );
}

/** Подозрительное «обнуление» — защита от случайной перезаписи при синхронизации */
export function isSuspiciousClinicDataDowngrade(
  existing: ClinicPersistedState,
  incoming: ClinicPersistedState
): boolean {
  if (!hasClinicData(existing)) return false;
  if (!hasClinicData(incoming)) return true;
  if (existing.patients.length > 0 && incoming.patients.length === 0) return true;
  if (existing.doctors.length > 0 && incoming.doctors.length === 0) return true;
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
    services: (d.services as Service[]) ?? [],
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
