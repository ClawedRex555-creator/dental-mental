"use client";

// Production: auth, RBAC, encryption, audit logs, backups, compliance required.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { format } from "date-fns";
import type {
  Appointment,
  Cabinet,
  ClinicDocumentTemplate,
  ClinicExpense,
  ClinicSettings,
  ClinicUser,
  Doctor,
  Invoice,
  DoctorMonthSchedule,
  LegalDocument,
  MedicalRecord,
  PatientPrepayment,
  OnlineBookingRequest,
  Patient,
  PatientFile,
  PatientNote,
  Payment,
  PaymentMethod,
  Service,
  Task,
  ToothRecord,
  TreatmentPlan,
  ThemeMode,
  UserRole,
  WarehouseItem,
  WorkAct,
} from "@/lib/types";
import {
  CLINIC_STORAGE_KEY,
  createEmptyClinicData,
  LEGACY_CLINIC_STORAGE_KEYS,
} from "@/lib/initial-clinic-data";
import { defaultWeeklySchedule, formatWeeklyScheduleSummary, monthKey } from "@/lib/clinic-schedule";
import { generateId } from "@/lib/utils";
import {
  cabinets as initialCabinets,
  clinicSettings as initialClinicSettings,
  doctors as initialDoctors,
  services as initialServices,
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
  currentUser,
  generateDefaultTeeth,
} from "@/lib/mock-data";

interface ClinicState {
  currentUser: ClinicUser;
  currentRole: UserRole;
  clinicSettings: ClinicSettings;
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
  sidebarOpen: boolean;
  documentTemplates: ClinicDocumentTemplate[];
  clinicExpenses: ClinicExpense[];
  legalDocuments: LegalDocument[];
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  /** Тема интерфейса по id пользователя (сохраняется в localStorage) */
  userThemePreferences: Record<string, ThemeMode>;

  setSessionUser: (user: ClinicUser) => void;
  clearSession: () => void;
  updateClinicSettings: (data: Partial<ClinicSettings>) => void;
  updateCurrentUser: (data: Partial<Pick<ClinicUser, "name" | "email">>) => void;
  setUserTheme: (theme: ThemeMode) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  addDoctor: (doctor: Doctor) => void;
  updateDoctor: (id: string, data: Partial<Doctor>) => void;
  removeDoctor: (id: string) => void;
  addCabinet: (cabinet: Cabinet) => void;
  removeCabinet: (id: string) => void;
  assignStaffToCabinet: (cabinetId: string, staffId: string) => void;
  addService: (service: Service) => void;
  updateService: (id: string, data: Partial<Service>) => void;
  removeService: (id: string) => void;
  addDocumentTemplate: (doc: ClinicDocumentTemplate) => void;
  updateDocumentTemplate: (id: string, data: Partial<ClinicDocumentTemplate>) => void;
  removeDocumentTemplate: (id: string) => void;
  addClinicExpense: (expense: ClinicExpense) => void;
  addLegalDocument: (doc: LegalDocument) => void;
  updateLegalDocument: (id: string, data: Partial<LegalDocument>) => void;
  removeLegalDocument: (id: string) => void;
  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, data: Partial<Patient>) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, data: Partial<Appointment>) => void;
  addMedicalRecord: (record: MedicalRecord) => void;
  addTreatmentPlan: (plan: TreatmentPlan) => void;
  updateTreatmentPlan: (id: string, data: Partial<TreatmentPlan>) => void;
  addPayment: (payment: Payment) => void;
  addInvoice: (invoice: Invoice) => void;
  addWorkAct: (act: WorkAct) => void;
  updateWorkAct: (id: string, data: Partial<WorkAct>) => void;
  linkWorkActToMedicalRecord: (actId: string, recordId: string) => void;
  saveDoctorMonthSchedule: (schedule: DoctorMonthSchedule) => void;
  addPrepayment: (prepayment: PatientPrepayment) => void;
  payWorkAct: (actId: string, method?: PaymentMethod) => boolean;
  getNextActNumber: () => string;
  updateWarehouseItem: (id: string, data: Partial<WarehouseItem>) => void;
  updateTeeth: (patientId: string, teeth: ToothRecord[]) => void;
  getPatientTeeth: (patientId: string) => ToothRecord[];
  addPatientNote: (note: PatientNote) => void;
  addPatientFile: (file: PatientFile) => void;
  updateOnlineBooking: (id: string, data: Partial<OnlineBookingRequest>) => void;
  /** Удалить все данные клиники (пациенты, записи, акты, сотрудники и т.д.) */
  resetAllData: () => void;
}

export const useClinicStore = create<ClinicState>()(
  persist(
    (set, get) => ({
      currentUser: {
        id: "",
        name: "",
        email: "",
        role: "assistant",
        status: "inactive",
      },
      currentRole: "assistant",
      clinicSettings: { ...initialClinicSettings },
      doctors: initialDoctors,
      services: initialServices,
      cabinets: initialCabinets,
      patients: initialPatients,
      appointments: initialAppointments,
      medicalRecords: initialMedicalRecords,
      treatmentPlans: initialTreatmentPlans,
      payments: initialPayments,
      invoices: initialInvoices,
      workActs: [] as WorkAct[],
      actCounter: 1,
      warehouse: initialWarehouse,
      tasks: initialTasks,
      onlineBookings: initialOnlineBookings,
      patientFiles: initialPatientFiles,
      patientNotes: initialPatientNotes,
      teethByPatient: {},
      sidebarOpen: false,
      documentTemplates: [],
      clinicExpenses: [],
      legalDocuments: [],
      doctorSchedules: [],
      prepayments: [],
      userThemePreferences: {},

      setSessionUser: (user) =>
        set((s) => {
          const userThemePreferences = { ...s.userThemePreferences };
          const legacy = s.clinicSettings.theme;
          if (user.id && !userThemePreferences[user.id] && legacy) {
            userThemePreferences[user.id] = legacy;
          }
          return {
            currentUser: user,
            currentRole: user.role,
            userThemePreferences,
          };
        }),

      clearSession: () =>
        set({
          currentUser: {
            id: "",
            name: "",
            email: "",
            role: "assistant",
            status: "inactive",
          },
          currentRole: "assistant",
        }),

      updateClinicSettings: (data) =>
        set((s) => {
          const next = { ...s.clinicSettings, ...data };
          if (data.weeklySchedule) {
            next.workHours = formatWeeklyScheduleSummary(data.weeklySchedule);
          }
          return { clinicSettings: next };
        }),

      updateCurrentUser: (data) =>
        set((s) => ({
          currentUser: { ...s.currentUser, ...data },
        })),

      setUserTheme: (theme) =>
        set((s) => {
          const id = s.currentUser.id;
          if (!id) return s;
          return {
            userThemePreferences: { ...s.userThemePreferences, [id]: theme },
          };
        }),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      addDoctor: (doctor) =>
        set((s) => {
          const mk = monthKey();
          const scheduleEntry: DoctorMonthSchedule | null =
            doctor.role === "doctor"
              ? {
                  doctorId: doctor.id,
                  month: mk,
                  days: {},
                  updatedAt: format(new Date(), "yyyy-MM-dd"),
                }
              : null;
          return {
            doctors: [doctor, ...s.doctors],
            doctorSchedules: scheduleEntry
              ? [scheduleEntry, ...s.doctorSchedules]
              : s.doctorSchedules,
          };
        }),

      updateDoctor: (id, data) =>
        set((s) => ({
          doctors: s.doctors.map((d) => (d.id === id ? { ...d, ...data } : d)),
        })),

      removeDoctor: (id) =>
        set((s) => ({
          doctors: s.doctors.filter((d) => d.id !== id),
          doctorSchedules: s.doctorSchedules.filter((sch) => sch.doctorId !== id),
          cabinets: s.cabinets.map((c) => ({
            ...c,
            staffIds: c.staffIds.filter((sid) => sid !== id),
          })),
          appointments: s.appointments.map((a) => {
            if (a.doctorId === id) {
              return { ...a, doctorId: undefined };
            }
            if (a.assistantId === id) {
              return { ...a, assistantId: undefined, assistantHours: undefined };
            }
            return a;
          }),
          workActs: s.workActs.map((act) =>
            act.doctorId === id ? { ...act, doctorId: undefined } : act
          ),
        })),

      addCabinet: (cabinet) =>
        set((s) => ({ cabinets: [cabinet, ...s.cabinets] })),

      removeCabinet: (id) =>
        set((s) => ({
          cabinets: s.cabinets.filter((c) => c.id !== id),
          doctors: s.doctors.map((d) =>
            d.cabinetId === id ? { ...d, cabinetId: undefined, cabinet: "—" } : d
          ),
          appointments: s.appointments.map((a) =>
            a.cabinetId === id ? { ...a, cabinetId: undefined } : a
          ),
        })),

      assignStaffToCabinet: (cabinetId, staffId) =>
        set((s) => ({
          cabinets: s.cabinets.map((c) =>
            c.id === cabinetId && !c.staffIds.includes(staffId)
              ? { ...c, staffIds: [...c.staffIds, staffId] }
              : c
          ),
          doctors: s.doctors.map((d) =>
            d.id === staffId ? { ...d, cabinetId, cabinet: s.cabinets.find((x) => x.id === cabinetId)?.name ?? d.cabinet } : d
          ),
        })),

      addDocumentTemplate: (doc) =>
        set((s) => ({ documentTemplates: [doc, ...s.documentTemplates] })),

      updateDocumentTemplate: (id, data) =>
        set((s) => ({
          documentTemplates: s.documentTemplates.map((d) =>
            d.id === id ? { ...d, ...data } : d
          ),
        })),

      removeDocumentTemplate: (id) =>
        set((s) => ({
          documentTemplates: s.documentTemplates.filter((d) => d.id !== id),
        })),

      addClinicExpense: (expense) =>
        set((s) => ({ clinicExpenses: [expense, ...s.clinicExpenses] })),

      addLegalDocument: (doc) =>
        set((s) => ({ legalDocuments: [doc, ...s.legalDocuments] })),

      updateLegalDocument: (id, data) =>
        set((s) => ({
          legalDocuments: s.legalDocuments.map((d) =>
            d.id === id ? { ...d, ...data } : d
          ),
        })),

      removeLegalDocument: (id) =>
        set((s) => ({
          legalDocuments: s.legalDocuments.filter((d) => d.id !== id),
        })),

      addService: (service) =>
        set((s) => ({ services: [service, ...s.services] })),

      updateService: (id, data) =>
        set((s) => ({
          services: s.services.map((svc) => (svc.id === id ? { ...svc, ...data } : svc)),
        })),

      removeService: (id) =>
        set((s) => ({
          services: s.services.filter((svc) => svc.id !== id),
        })),

      addPatient: (patient) =>
        set((s) => ({
          patients: [patient, ...s.patients],
          teethByPatient: { ...s.teethByPatient, [patient.id]: generateDefaultTeeth() },
        })),

      updatePatient: (id, data) =>
        set((s) => ({
          patients: s.patients.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      addAppointment: (appointment) =>
        set((s) => ({ appointments: [appointment, ...s.appointments] })),

      updateAppointment: (id, data) =>
        set((s) => ({
          appointments: s.appointments.map((a) =>
            a.id === id ? { ...a, ...data } : a
          ),
        })),

      addMedicalRecord: (record) =>
        set((s) => ({ medicalRecords: [record, ...s.medicalRecords] })),

      addTreatmentPlan: (plan) =>
        set((s) => ({ treatmentPlans: [plan, ...s.treatmentPlans] })),

      updateTreatmentPlan: (id, data) =>
        set((s) => ({
          treatmentPlans: s.treatmentPlans.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        })),

      addPayment: (payment) =>
        set((s) => ({ payments: [payment, ...s.payments] })),

      addInvoice: (invoice) =>
        set((s) => ({ invoices: [invoice, ...s.invoices] })),

      getNextActNumber: () => {
        const n = get().actCounter;
        set({ actCounter: n + 1 });
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${String(n).padStart(4, "0")}-${month}/${year}`;
      },

      addWorkAct: (act) =>
        set((s) => ({ workActs: [act, ...s.workActs] })),

      updateWorkAct: (id, data) =>
        set((s) => ({
          workActs: s.workActs.map((a) => (a.id === id ? { ...a, ...data } : a)),
        })),

      saveDoctorMonthSchedule: (schedule) =>
        set((s) => {
          const rest = s.doctorSchedules.filter(
            (x) => !(x.doctorId === schedule.doctorId && x.month === schedule.month)
          );
          return { doctorSchedules: [schedule, ...rest] };
        }),

      addPrepayment: (prepayment) =>
        set((s) => {
          const patient = s.patients.find((p) => p.id === prepayment.patientId);
          const debt = prepayment.remainingAmount;
          const newBalance = (patient?.balance ?? 0) - debt;
          return {
            prepayments: [prepayment, ...s.prepayments],
            patients: s.patients.map((p) =>
              p.id === prepayment.patientId
                ? {
                    ...p,
                    balance: newBalance,
                    status: newBalance < 0 ? ("debtor" as const) : p.status,
                  }
                : p
            ),
          };
        }),

      linkWorkActToMedicalRecord: (actId, recordId) =>
        set((s) => ({
          workActs: s.workActs.map((a) =>
            a.id === actId ? { ...a, medicalRecordId: recordId } : a
          ),
          medicalRecords: s.medicalRecords.map((r) =>
            r.id === recordId ? { ...r, workActId: actId } : r
          ),
        })),

      payWorkAct: (actId, method = "cash") => {
        const state = get();
        const act = state.workActs.find((a) => a.id === actId);
        if (!act || act.paymentStatus === "paid") return false;

        const invoice =
          (act.invoiceId
            ? state.invoices.find((i) => i.id === act.invoiceId)
            : undefined) ??
          state.invoices.find((i) => i.workActId === actId);

        const payment: Payment = {
          id: generateId("pay"),
          patientId: act.patientId,
          workActId: actId,
          amount: act.totalAmount,
          method,
          status: "paid",
          date: format(new Date(), "yyyy-MM-dd"),
          comment: `Оплата по акту ${act.actNumber}`,
        };

        set((s) => ({
          workActs: s.workActs.map((a) =>
            a.id === actId ? { ...a, paymentStatus: "paid" as const } : a
          ),
          invoices: s.invoices.map((inv) => {
            const linked =
              inv.id === invoice?.id ||
              inv.workActId === actId ||
              inv.description.includes(act.actNumber);
            if (!linked) return inv;
            return {
              ...inv,
              workActId: actId,
              status: "paid" as const,
              paid: act.totalAmount,
            };
          }),
          payments: [payment, ...s.payments],
          patients: s.patients.map((p) =>
            p.id === act.patientId
              ? {
                  ...p,
                  totalSpent: p.totalSpent + act.totalAmount,
                  balance: Math.max(0, p.balance - act.totalAmount),
                }
              : p
          ),
        }));
        return true;
      },

      updateWarehouseItem: (id, data) =>
        set((s) => ({
          warehouse: s.warehouse.map((w) =>
            w.id === id ? { ...w, ...data } : w
          ),
        })),

      updateTeeth: (patientId, teeth) =>
        set((s) => ({
          teethByPatient: { ...s.teethByPatient, [patientId]: teeth },
        })),

      getPatientTeeth: (patientId) => {
        const state = get();
        return state.teethByPatient[patientId] ?? generateDefaultTeeth();
      },

      addPatientNote: (note) =>
        set((s) => ({ patientNotes: [note, ...s.patientNotes] })),

      addPatientFile: (file) =>
        set((s) => ({ patientFiles: [file, ...s.patientFiles] })),

      updateOnlineBooking: (id, data) =>
        set((s) => ({
          onlineBookings: s.onlineBookings.map((b) =>
            b.id === id ? { ...b, ...data } : b
          ),
        })),

      resetAllData: () => {
        const savedThemes = get().userThemePreferences;
        if (typeof window !== "undefined") {
          for (const key of LEGACY_CLINIC_STORAGE_KEYS) {
            localStorage.removeItem(key);
          }
          localStorage.removeItem(CLINIC_STORAGE_KEY);
        }
        set({
          ...createEmptyClinicData(),
          userThemePreferences: savedThemes,
          sidebarOpen: get().sidebarOpen,
        });
      },
    }),
    {
      name: CLINIC_STORAGE_KEY,
      skipHydration: true,
      partialize: (state) => ({
        doctors: state.doctors,
        services: state.services,
        cabinets: state.cabinets,
        patients: state.patients,
        appointments: state.appointments,
        medicalRecords: state.medicalRecords,
        treatmentPlans: state.treatmentPlans,
        payments: state.payments,
        invoices: state.invoices,
        workActs: state.workActs,
        actCounter: state.actCounter,
        warehouse: state.warehouse,
        tasks: state.tasks,
        onlineBookings: state.onlineBookings,
        patientFiles: state.patientFiles,
        patientNotes: state.patientNotes,
        clinicSettings: state.clinicSettings,
        documentTemplates: state.documentTemplates,
        clinicExpenses: state.clinicExpenses,
        legalDocuments: state.legalDocuments,
        doctorSchedules: state.doctorSchedules,
        prepayments: state.prepayments,
        userThemePreferences: state.userThemePreferences,
      }),
    }
  )
);
