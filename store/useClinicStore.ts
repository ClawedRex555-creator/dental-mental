"use client";

// Production: auth, RBAC, encryption, audit logs, backups, compliance required.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
import { CLINIC_STORAGE_KEY, LEGACY_CLINIC_STORAGE_KEYS } from "@/lib/initial-clinic-data";
import {
  createFreshPersistedState,
  mergeByIdPreferLocal,
  mergeDoctorSchedules,
  mergeClinicPatients,
  pickPersistedState,
  pickPersistedStateForStorage,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  derivePatientVisitFields,
  syncOtherClinicVisitsInList,
} from "@/lib/patient-visits";
import {
  mergeClinicServices,
  migrateServices,
  normalizeServiceFields,
} from "@/lib/service-categories";
import {
  clearPersistedClinicData,
  createSafeClinicStorage,
} from "@/lib/clinic-storage-client";
import { defaultWeeklySchedule, formatWeeklyScheduleSummary, monthKey } from "@/lib/clinic-schedule";
import { treatmentPlanNoteId } from "@/lib/treatment-plan-patient-note";
import { generateId } from "@/lib/utils";
import { generateDefaultTeeth } from "@/lib/mock-data";
import {
  defaultClinicModules,
  parseClinicModules,
  type ClinicModules,
} from "@/lib/modules";
import { findInvoiceForAct, patchInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import {
  mergeThemePreferences,
  persistThemePreferencesToStorage,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";

const freshState = createFreshPersistedState();

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
  /** Включённые модули (управляются супер-админом платформы) */
  enabledModules: ClinicModules;
  /** Синхронизация снимка с PostgreSQL (ClinicDataSync) */
  clinicSyncPhase: "loading" | "ready" | "read_only" | "local_only" | "forbidden" | "error";
  clinicDataUnsaved: boolean;
  clinicDataSaveError: string | null;
  /** Временно не слать PUT (например после удаления сотрудника на сервере) */
  clinicSavePausedUntil: number;

  setSessionUser: (user: ClinicUser) => void;
  setClinicSyncPhase: (phase: ClinicState["clinicSyncPhase"]) => void;
  setClinicDataUnsaved: (unsaved: boolean) => void;
  setClinicDataSaveError: (error: string | null) => void;
  pauseClinicAutoSave: (ms?: number) => void;
  setEnabledModules: (modules: ClinicModules) => void;
  clearSession: () => void;
  updateClinicSettings: (data: Partial<ClinicSettings>) => void;
  updateCurrentUser: (data: Partial<Pick<ClinicUser, "name" | "email">>) => void;
  setUserTheme: (theme: ThemeMode) => void;
  /** Тема для произвольного ключа (id пользователя или @guest:slug на экране входа) */
  setThemePreference: (accountKey: string, theme: ThemeMode) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  addDoctor: (doctor: Doctor) => void;
  setDoctors: (doctors: Doctor[]) => void;
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
  /** Запись в истории визитов для «был в другой клинике» */
  syncOtherClinicVisitForPatient: (patient: Patient) => void;
  /** Удалить пациента и связанные записи; false — не найден */
  deletePatient: (id: string) => boolean;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, data: Partial<Appointment>) => void;
  addMedicalRecord: (record: MedicalRecord) => void;
  addTreatmentPlan: (plan: TreatmentPlan) => void;
  updateTreatmentPlan: (id: string, data: Partial<TreatmentPlan>) => void;
  /** Удалить план лечения и связанную заметку; false — не найден */
  deleteTreatmentPlan: (id: string) => boolean;
  addPayment: (payment: Payment) => void;
  addInvoice: (invoice: Invoice) => void;
  addWorkAct: (act: WorkAct) => void;
  updateWorkAct: (id: string, data: Partial<WorkAct>) => void;
  linkWorkActToMedicalRecord: (actId: string, recordId: string) => void;
  saveDoctorMonthSchedule: (schedule: DoctorMonthSchedule) => void;
  addPrepayment: (prepayment: PatientPrepayment) => void;
  payWorkAct: (actId: string, method?: PaymentMethod) => boolean;
  /** Удалить акт (ожидает оплаты или оплачен); false — не найден */
  deleteWorkAct: (actId: string) => boolean;
  getNextActNumber: () => string;
  updateWarehouseItem: (id: string, data: Partial<WarehouseItem>) => void;
  updateTeeth: (patientId: string, teeth: ToothRecord[]) => void;
  getPatientTeeth: (patientId: string) => ToothRecord[];
  addPatientNote: (note: PatientNote) => void;
  updatePatientNote: (id: string, data: Partial<PatientNote>) => void;
  deletePatientNote: (id: string) => void;
  addPatientFile: (file: PatientFile) => void;
  updateOnlineBooking: (id: string, data: Partial<OnlineBookingRequest>) => void;
  /** Загрузить данные клиники с сервера (синхронизация между устройствами) */
  hydratePersistedState: (data: ClinicPersistedState) => void;
  /** Быстрая подстановка снимка с сервера без повторного merge */
  replacePersistedState: (data: ClinicPersistedState) => void;
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
      clinicSettings: freshState.clinicSettings,
      doctors: freshState.doctors,
      services: freshState.services,
      cabinets: freshState.cabinets,
      patients: freshState.patients,
      appointments: freshState.appointments,
      medicalRecords: freshState.medicalRecords,
      treatmentPlans: freshState.treatmentPlans,
      payments: freshState.payments,
      invoices: freshState.invoices,
      workActs: freshState.workActs,
      actCounter: freshState.actCounter,
      warehouse: freshState.warehouse,
      tasks: freshState.tasks,
      onlineBookings: freshState.onlineBookings,
      patientFiles: freshState.patientFiles,
      patientNotes: freshState.patientNotes,
      teethByPatient: freshState.teethByPatient,
      sidebarOpen: false,
      documentTemplates: freshState.documentTemplates,
      clinicExpenses: freshState.clinicExpenses,
      legalDocuments: freshState.legalDocuments,
      doctorSchedules: freshState.doctorSchedules,
      prepayments: freshState.prepayments,
      userThemePreferences: freshState.userThemePreferences,
      enabledModules: defaultClinicModules(),
      clinicSyncPhase: "loading",
      clinicDataUnsaved: false,
      clinicDataSaveError: null,
      clinicSavePausedUntil: 0,

      setClinicSyncPhase: (phase) => set({ clinicSyncPhase: phase }),
      setClinicDataUnsaved: (unsaved) => set({ clinicDataUnsaved: unsaved }),
      setClinicDataSaveError: (error) => set({ clinicDataSaveError: error }),
      pauseClinicAutoSave: (ms = 8000) =>
        set({ clinicSavePausedUntil: Date.now() + ms, clinicDataSaveError: null }),

      setSessionUser: (user) =>
        set((s) => ({
          currentUser: user,
          currentRole: user.role,
          userThemePreferences: mergeThemePreferences(
            readThemePreferencesFromStorage(),
            s.userThemePreferences
          ),
        })),

      setEnabledModules: (modules) =>
        set({ enabledModules: parseClinicModules(modules) }),

      clearSession: () => {
        const userThemePreferences = mergeThemePreferences(
          get().userThemePreferences,
          readThemePreferencesFromStorage()
        );
        persistThemePreferencesToStorage(userThemePreferences);
        clearPersistedClinicData();
        set({
          currentUser: {
            id: "",
            name: "",
            email: "",
            role: "assistant",
            status: "inactive",
          },
          currentRole: "assistant",
          enabledModules: defaultClinicModules(),
          userThemePreferences,
          clinicSyncPhase: "loading",
          clinicDataUnsaved: false,
          clinicDataSaveError: null,
        });
      },

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

      setThemePreference: (accountKey, theme) =>
        set((s) => {
          if (!accountKey) return s;
          const userThemePreferences = {
            ...s.userThemePreferences,
            [accountKey]: theme,
          };
          persistThemePreferencesToStorage(userThemePreferences);
          return { userThemePreferences };
        }),

      setUserTheme: (theme) => {
        const id = get().currentUser.id;
        if (!id) return;
        get().setThemePreference(id, theme);
      },

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      addDoctor: (doctor) =>
        set((s) => {
          const schedules = s.doctorSchedules ?? [];
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
              ? [scheduleEntry, ...schedules]
              : schedules,
          };
        }),

      setDoctors: (doctors) => set({ doctors }),

      updateDoctor: (id, data) =>
        set((s) => ({
          doctors: s.doctors.map((d) => (d.id === id ? { ...d, ...data } : d)),
        })),

      removeDoctor: (id) =>
        set((s) => {
          const schedules = s.doctorSchedules ?? [];
          return {
            doctors: s.doctors.filter((d) => d.id !== id),
            doctorSchedules: schedules.filter((sch) => sch.doctorId !== id),
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
          };
        }),

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
        set((s) => ({
          services: [normalizeServiceFields(service), ...s.services],
        })),

      updateService: (id, data) =>
        set((s) => ({
          services: s.services.map((svc) =>
            svc.id === id ? normalizeServiceFields({ ...svc, ...data }) : svc
          ),
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

      syncOtherClinicVisitForPatient: (patient) =>
        set((s) => {
          const appointments = syncOtherClinicVisitsInList(s.appointments, patient);
          const patients = s.patients.some((p) => p.id === patient.id)
            ? s.patients.map((p) =>
                p.id === patient.id
                  ? { ...p, ...derivePatientVisitFields(p, appointments) }
                  : p
              )
            : s.patients;
          return { appointments, patients };
        }),

      deletePatient: (id) => {
        if (!get().patients.some((p) => p.id === id)) return false;
        set((s) => {
          const { [id]: _removedTeeth, ...teethByPatient } = s.teethByPatient;
          void _removedTeeth;
          return {
            patients: s.patients.filter((p) => p.id !== id),
            appointments: s.appointments.filter((a) => a.patientId !== id),
            medicalRecords: s.medicalRecords.filter((r) => r.patientId !== id),
            treatmentPlans: s.treatmentPlans.filter((p) => p.patientId !== id),
            payments: s.payments.filter((p) => p.patientId !== id),
            invoices: s.invoices.filter((i) => i.patientId !== id),
            workActs: s.workActs.filter((a) => a.patientId !== id),
            prepayments: s.prepayments.filter((p) => p.patientId !== id),
            patientFiles: s.patientFiles.filter((f) => f.patientId !== id),
            patientNotes: s.patientNotes.filter((n) => n.patientId !== id),
            teethByPatient,
          };
        });
        return true;
      },

      addAppointment: (appointment) =>
        set((s) => {
          const appointments = [appointment, ...s.appointments];
          const patient = s.patients.find((p) => p.id === appointment.patientId);
          const patients = patient
            ? s.patients.map((p) =>
                p.id === appointment.patientId
                  ? { ...p, ...derivePatientVisitFields(p, appointments) }
                  : p
              )
            : s.patients;
          return { appointments, patients };
        }),

      updateAppointment: (id, data) =>
        set((s) => {
          const appointments = s.appointments.map((a) =>
            a.id === id ? { ...a, ...data } : a
          );
          const updated = appointments.find((a) => a.id === id);
          const patientId = updated?.patientId ?? data.patientId;
          const patients =
            patientId && s.patients.some((p) => p.id === patientId)
              ? s.patients.map((p) =>
                  p.id === patientId
                    ? { ...p, ...derivePatientVisitFields(p, appointments) }
                    : p
                )
              : s.patients;
          return { appointments, patients };
        }),

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

      deleteTreatmentPlan: (id) => {
        if (!get().treatmentPlans.some((p) => p.id === id)) return false;
        const linkedNoteId = treatmentPlanNoteId(id);
        set((s) => ({
          treatmentPlans: s.treatmentPlans.filter((p) => p.id !== id),
          patientNotes: s.patientNotes.filter(
            (n) => n.sourceTreatmentPlanId !== id && n.id !== linkedNoteId
          ),
        }));
        return true;
      },

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
        set((s) => {
          const workActs = s.workActs.map((a) => (a.id === id ? { ...a, ...data } : a));
          const act = workActs.find((a) => a.id === id);
          if (!act) return { workActs };

          const linked = findInvoiceForAct(s.invoices, act);
          if (!linked) return { workActs };

          return {
            workActs,
            invoices: s.invoices.map((inv) =>
              inv.id === linked.id ? patchInvoiceFromWorkAct(inv, act) : inv
            ),
          };
        }),

      saveDoctorMonthSchedule: (schedule) =>
        set((s) => {
          const schedules = s.doctorSchedules ?? [];
          const rest = schedules.filter(
            (x) => !(x.doctorId === schedule.doctorId && x.month === schedule.month)
          );
          return { doctorSchedules: [schedule, ...rest] };
        }),

      addPrepayment: (prepayment) =>
        set((s) => {
          const prepayments = s.prepayments ?? [];
          const patient = s.patients.find((p) => p.id === prepayment.patientId);
          const debt = prepayment.remainingAmount;
          const newBalance = (patient?.balance ?? 0) - debt;
          return {
            prepayments: [prepayment, ...prepayments],
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

      deleteWorkAct: (actId) => {
        const state = get();
        const act = state.workActs.find((a) => a.id === actId);
        if (!act) return false;

        const paidViaPayments = state.payments
          .filter((p) => p.workActId === actId && p.status === "paid")
          .reduce((sum, p) => sum + p.amount, 0);
        const reverseAmount =
          paidViaPayments > 0
            ? paidViaPayments
            : act.paymentStatus === "paid"
              ? act.totalAmount
              : 0;

        set((s) => ({
          workActs: s.workActs.filter((a) => a.id !== actId),
          invoices: s.invoices.filter(
            (inv) => inv.workActId !== actId && inv.id !== act.invoiceId
          ),
          payments: s.payments.filter((p) => p.workActId !== actId),
          patients: s.patients.map((p) => {
            if (p.id !== act.patientId || reverseAmount <= 0) return p;
            return {
              ...p,
              totalSpent: Math.max(0, p.totalSpent - reverseAmount),
              balance: p.balance + reverseAmount,
            };
          }),
          medicalRecords: s.medicalRecords.map((r) =>
            r.workActId === actId ? { ...r, workActId: undefined } : r
          ),
          appointments: s.appointments.map((a) => {
            if (a.workActId !== actId) return a;
            return {
              ...a,
              workActId: undefined,
              status: a.status === "ready_for_payment" ? ("completed" as const) : a.status,
            };
          }),
          prepayments: (s.prepayments ?? []).map((p) =>
            p.workActId === actId
              ? { ...p, workActId: undefined, actNumber: undefined }
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

      updatePatientNote: (id, data) =>
        set((s) => ({
          patientNotes: s.patientNotes.map((n) =>
            n.id === id ? { ...n, ...data } : n
          ),
        })),

      deletePatientNote: (id) =>
        set((s) => ({
          patientNotes: s.patientNotes.filter((n) => n.id !== id),
        })),

      addPatientFile: (file) =>
        set((s) => ({ patientFiles: [file, ...s.patientFiles] })),

      updateOnlineBooking: (id, data) =>
        set((s) => ({
          onlineBookings: s.onlineBookings.map((b) =>
            b.id === id ? { ...b, ...data } : b
          ),
        })),

      replacePersistedState: (data) =>
        set((s) => ({
          doctors: data.doctors ?? [],
          services: migrateServices(data.services ?? []),
          cabinets: data.cabinets ?? [],
          patients: data.patients ?? [],
          appointments: data.appointments ?? [],
          medicalRecords: data.medicalRecords ?? [],
          treatmentPlans: data.treatmentPlans ?? [],
          payments: data.payments ?? [],
          invoices: data.invoices ?? [],
          workActs: data.workActs ?? [],
          actCounter: data.actCounter ?? 1,
          warehouse: data.warehouse ?? [],
          tasks: data.tasks ?? [],
          onlineBookings: data.onlineBookings ?? [],
          patientFiles: data.patientFiles ?? [],
          patientNotes: data.patientNotes ?? [],
          teethByPatient: data.teethByPatient ?? {},
          clinicSettings: data.clinicSettings,
          documentTemplates: data.documentTemplates ?? [],
          clinicExpenses: data.clinicExpenses ?? [],
          legalDocuments: data.legalDocuments ?? [],
          doctorSchedules: data.doctorSchedules ?? [],
          prepayments: data.prepayments ?? [],
          userThemePreferences: mergeThemePreferences(
            data.userThemePreferences,
            readThemePreferencesFromStorage(),
            s.userThemePreferences
          ),
        })),

      hydratePersistedState: (data) =>
        set((s) => ({
          doctors: mergeByIdPreferLocal(data.doctors ?? [], s.doctors),
          services: mergeClinicServices(data.services ?? [], s.services),
          cabinets: mergeByIdPreferLocal(data.cabinets ?? [], s.cabinets),
          patients: mergeClinicPatients(data.patients ?? [], s.patients),
          appointments: mergeByIdPreferLocal(data.appointments ?? [], s.appointments),
          medicalRecords: mergeByIdPreferLocal(data.medicalRecords ?? [], s.medicalRecords),
          treatmentPlans: mergeByIdPreferLocal(data.treatmentPlans ?? [], s.treatmentPlans),
          payments: mergeByIdPreferLocal(data.payments ?? [], s.payments),
          invoices: mergeByIdPreferLocal(data.invoices ?? [], s.invoices),
          workActs: mergeByIdPreferLocal(data.workActs ?? [], s.workActs),
          actCounter: Math.max(data.actCounter ?? 1, s.actCounter),
          warehouse: mergeByIdPreferLocal(data.warehouse ?? [], s.warehouse),
          tasks: mergeByIdPreferLocal(data.tasks ?? [], s.tasks),
          onlineBookings: mergeByIdPreferLocal(data.onlineBookings ?? [], s.onlineBookings),
          patientFiles: mergeByIdPreferLocal(data.patientFiles ?? [], s.patientFiles),
          patientNotes: mergeByIdPreferLocal(data.patientNotes ?? [], s.patientNotes),
          teethByPatient: { ...s.teethByPatient, ...data.teethByPatient },
          clinicSettings: data.clinicSettings ?? s.clinicSettings,
          documentTemplates: mergeByIdPreferLocal(
            data.documentTemplates ?? [],
            s.documentTemplates
          ),
          clinicExpenses: mergeByIdPreferLocal(data.clinicExpenses ?? [], s.clinicExpenses),
          legalDocuments: mergeByIdPreferLocal(data.legalDocuments ?? [], s.legalDocuments),
          doctorSchedules: mergeDoctorSchedules(data.doctorSchedules ?? [], s.doctorSchedules),
          prepayments: mergeByIdPreferLocal(data.prepayments ?? [], s.prepayments),
          userThemePreferences: mergeThemePreferences(
            data.userThemePreferences,
            readThemePreferencesFromStorage(),
            s.userThemePreferences
          ),
        })),

      resetAllData: () => {
        const savedThemes = mergeThemePreferences(
          get().userThemePreferences,
          readThemePreferencesFromStorage()
        );
        persistThemePreferencesToStorage(savedThemes);
        const fresh = createFreshPersistedState();
        if (typeof window !== "undefined") {
          for (const key of LEGACY_CLINIC_STORAGE_KEYS) {
            localStorage.removeItem(key);
          }
          localStorage.removeItem(CLINIC_STORAGE_KEY);
        }
        set({
          ...fresh,
          userThemePreferences: savedThemes,
          sidebarOpen: get().sidebarOpen,
        });
      },
    }),
    {
      name: CLINIC_STORAGE_KEY,
      skipHydration: true,
      storage: createJSONStorage(() => createSafeClinicStorage()),
      partialize: (state) => pickPersistedStateForStorage(state),
      onRehydrateStorage: () => (state) => {
        if (state?.services?.length) {
          state.services = migrateServices(state.services);
        }
      },
    }
  )
);
