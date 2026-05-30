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
import { clinicSettings as defaultClinicSettings } from "@/lib/mock-data";

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
    patientFiles: state.patientFiles ?? [],
    patientNotes: state.patientNotes ?? [],
    teethByPatient: state.teethByPatient ?? {},
    clinicSettings: state.clinicSettings,
    documentTemplates: state.documentTemplates ?? [],
    clinicExpenses: state.clinicExpenses ?? [],
    legalDocuments: state.legalDocuments ?? [],
    doctorSchedules: state.doctorSchedules ?? [],
    prepayments: state.prepayments ?? [],
    userThemePreferences: state.userThemePreferences ?? {},
  };
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
    patientFiles: (d.patientFiles as PatientFile[]) ?? [],
    patientNotes: (d.patientNotes as PatientNote[]) ?? [],
    teethByPatient: (d.teethByPatient as Record<string, ToothRecord[]>) ?? {},
    clinicSettings: (d.clinicSettings as ClinicSettings) ?? fresh.clinicSettings,
    documentTemplates: (d.documentTemplates as ClinicDocumentTemplate[]) ?? [],
    clinicExpenses: (d.clinicExpenses as ClinicExpense[]) ?? [],
    legalDocuments: (d.legalDocuments as LegalDocument[]) ?? [],
    doctorSchedules: (d.doctorSchedules as DoctorMonthSchedule[]) ?? [],
    prepayments: (d.prepayments as PatientPrepayment[]) ?? [],
    userThemePreferences: (d.userThemePreferences as Record<string, ThemeMode>) ?? {},
  };
}
