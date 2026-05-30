import type {
  Appointment,
  Cabinet,
  ClinicDocumentTemplate,
  ClinicExpense,
  ClinicSettings,
  ClinicUser,
  Doctor,
  Invoice,
  LegalDocument,
  MedicalRecord,
  OnlineBookingRequest,
  Patient,
  PatientFile,
  PatientNote,
  Payment,
  Service,
  Task,
  ToothRecord,
  TreatmentPlan,
  UserRole,
  WarehouseItem,
  WorkAct,
} from "@/lib/types";
import {
  cabinets,
  clinicSettings as initialClinicSettings,
  currentUser,
  doctors,
  initialAppointments,
  initialInvoices,
  initialMedicalRecords,
  initialOnlineBookings,
  initialPatientFiles,
  initialPatientNotes,
  initialPatients,
  initialPayments,
  initialTasks,
  initialTreatmentPlans,
  initialWarehouse,
  services,
} from "@/lib/mock-data";

/** Пустое состояние клиники для старта с нуля */
export function createEmptyClinicData() {
  return {
    clinicSettings: { ...initialClinicSettings } as ClinicSettings,
    currentUser: { ...currentUser } as ClinicUser,
    currentRole: currentUser.role as UserRole,
    doctors: [...doctors] as Doctor[],
    services: [...services] as Service[],
    cabinets: [...cabinets] as Cabinet[],
    patients: [...initialPatients] as Patient[],
    appointments: [...initialAppointments] as Appointment[],
    medicalRecords: [...initialMedicalRecords] as MedicalRecord[],
    treatmentPlans: [...initialTreatmentPlans] as TreatmentPlan[],
    payments: [...initialPayments] as Payment[],
    invoices: [...initialInvoices] as Invoice[],
    workActs: [] as WorkAct[],
    actCounter: 1,
    warehouse: [...initialWarehouse] as WarehouseItem[],
    tasks: [...initialTasks] as Task[],
    onlineBookings: [...initialOnlineBookings] as OnlineBookingRequest[],
    patientFiles: [...initialPatientFiles] as PatientFile[],
    patientNotes: [...initialPatientNotes] as PatientNote[],
    teethByPatient: {} as Record<string, ToothRecord[]>,
    documentTemplates: [] as ClinicDocumentTemplate[],
    clinicExpenses: [] as ClinicExpense[],
    legalDocuments: [] as LegalDocument[],
  };
}

export const CLINIC_STORAGE_KEY = "dentalcloud-mis-storage-v4";

export const LEGACY_CLINIC_STORAGE_KEYS = [
  "dentalcloud-mis-storage-v3",
  "dentalcloud-mis-storage-v2",
  "dentalcloud-mis-storage",
] as const;
