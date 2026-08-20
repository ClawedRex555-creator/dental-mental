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
import type { ClinicSaveStatus } from "@/lib/clinic-save-feedback";
import { clearPendingClinicSnapshot } from "@/lib/clinic-pending-sync";
import { requestClinicDataFlush } from "@/lib/clinic-data-sync.client";

/** Один flush после цепочки set() в том же тике (акт + счёт + медзапись) */
let clinicFlushMicrotask = false;
/**
 * Пока >0:
 * - store-изменения не ставят полный PUT в очередь;
 * - фоновый pull/force-pull не применяется (иначе откатывает статус до ответа command API).
 */
let clinicCommandOptimisticDepth = 0;
let clinicCommandMutationEndedHandlers: Array<() => void> = [];

/** Держать на всё время async command (optimistic → await API → markSynced). */
export function beginClinicCommandMutation(): void {
  clinicCommandOptimisticDepth += 1;
}

export function endClinicCommandMutation(): void {
  clinicCommandOptimisticDepth = Math.max(0, clinicCommandOptimisticDepth - 1);
  if (clinicCommandOptimisticDepth === 0 && clinicCommandMutationEndedHandlers.length) {
    const handlers = clinicCommandMutationEndedHandlers;
    clinicCommandMutationEndedHandlers = [];
    for (const handler of handlers) {
      try {
        handler();
      } catch {
        /* ignore */
      }
    }
  }
}

export function onClinicCommandMutationEnded(handler: () => void): () => void {
  clinicCommandMutationEndedHandlers.push(handler);
  return () => {
    clinicCommandMutationEndedHandlers = clinicCommandMutationEndedHandlers.filter(
      (h) => h !== handler
    );
  };
}

export function runWithoutClinicFlush(fn: () => void): void {
  beginClinicCommandMutation();
  try {
    fn();
  } finally {
    endClinicCommandMutation();
  }
}

export function isClinicCommandOptimisticUpdate(): boolean {
  return clinicCommandOptimisticDepth > 0;
}

function scheduleClinicDataFlush(): void {
  const role = useClinicStore.getState().currentRole;
  if (!canUseDayToDaySnapshotPut(role)) return;
  if (clinicCommandOptimisticDepth > 0) return;
  if (typeof queueMicrotask === "undefined") {
    requestClinicDataFlush();
    return;
  }
  if (clinicFlushMicrotask) return;
  clinicFlushMicrotask = true;
  queueMicrotask(() => {
    clinicFlushMicrotask = false;
    if (clinicCommandOptimisticDepth > 0) return;
    requestClinicDataFlush();
  });
}
import {
  createFreshPersistedState,
  mergeByIdPreferLocal,
  mergeDoctorSchedules,
  mergeEntityListWithTombstones,
  applyAllDeletionTombstones,
  mergeLegalDocumentsState,
  mergeServicesState,
  mergeWorkActsState,
  pickPersistedState,
  pickPersistedStateForStorage,
  repairFinancialCoupling,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  derivePatientVisitFields,
  syncOtherClinicVisitsInList,
} from "@/lib/patient-visits";
import {
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
import { buildWorkActMedicalRecommendations } from "@/lib/work-act-utils";
import {
  allocateNextActSequence,
  formatWorkActNumber,
} from "@/lib/work-act-number";
import { ensureMedicalRecordForWorkAct } from "@/lib/work-act-medical-record";
import { applyWorkActItemsToTeeth } from "@/lib/work-act-teeth";
import { findInvoiceForAct, patchInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import {
  syncAppointmentsAfterActPaid,
} from "@/lib/appointment-act-payment";
import { applyPayWorkActToPersistedState } from "@/lib/apply-pay-work-act";
import {
  applyCreateAppointmentToPersistedState,
  applyUpdateAppointmentToPersistedState,
} from "@/lib/apply-appointment-commands";
import {
  getWorkActPaidAmount,
  isWorkActFullyPaid,
} from "@/lib/work-act-payment";
import {
  detachAppointmentFromWorkAct,
  removeSyntheticVisitForWorkAct,
  syncVisitForWorkAct,
} from "@/lib/work-act-visit";
import {
  mergeThemePreferences,
  persistThemePreferencesToStorage,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";
import { canManageServices } from "@/lib/rbac";
import { canUseDayToDaySnapshotPut } from "@/lib/clinic-data-access";
import {
  mergeAssistantManualHours,
  normalizeAssistantManualHours,
  type AssistantManualHoursMap,
} from "@/lib/assistant-hours";

const freshState = createFreshPersistedState();

function withPatientVisitFields(
  patients: Patient[],
  appointments: Appointment[],
  patientId: string
): Patient[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return patients;
  const fields = derivePatientVisitFields(patient, appointments);
  return patients.map((p) => (p.id === patientId ? { ...p, ...fields } : p));
}

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
  deletedLegalDocumentIds: string[];
  deletedServiceIds: string[];
  deletedWorkActIds: string[];
  deletedPatientIds: string[];
  deletedDoctorIds: string[];
  deletedAppointmentIds: string[];
  deletedMedicalRecordIds: string[];
  deletedTreatmentPlanIds: string[];
  doctorSchedules: DoctorMonthSchedule[];
  prepayments: PatientPrepayment[];
  /** Ручные часы ассистента по датам (yyyy-MM-dd), если смена не привязана к приёму */
  assistantManualHours: AssistantManualHoursMap;
  /** Тема интерфейса по id пользователя (сохраняется в localStorage) */
  userThemePreferences: Record<string, ThemeMode>;
  /** Включённые модули (управляются супер-админом платформы) */
  enabledModules: ClinicModules;
  /** Синхронизация снимка с PostgreSQL (ClinicDataSync) */
  clinicSyncPhase: "loading" | "ready" | "read_only" | "local_only" | "forbidden" | "error";
  clinicDataUnsaved: boolean;
  /** idle — на сервере; pending/saving — отправка; saved — подтверждено; failed — только локально */
  clinicSaveStatus: ClinicSaveStatus;
  /** На сервере есть более новый снимок, чем в этой вкладке */
  clinicServerNewerAvailable: boolean;
  clinicDataSaveError: string | null;
  /** Временно не слать PUT (например после удаления сотрудника на сервере) */
  clinicSavePausedUntil: number;

  setSessionUser: (user: ClinicUser) => void;
  setClinicSyncPhase: (phase: ClinicState["clinicSyncPhase"]) => void;
  setClinicDataUnsaved: (unsaved: boolean) => void;
  setClinicSaveStatus: (status: ClinicSaveStatus) => void;
  setClinicServerNewerAvailable: (available: boolean) => void;
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
  removeDoctor: (id: string, options?: { skipFlush?: boolean }) => void;
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
  removeClinicExpense: (id: string) => void;
  addLegalDocument: (doc: LegalDocument) => void;
  updateLegalDocument: (id: string, data: Partial<LegalDocument>) => void;
  removeLegalDocument: (id: string) => void;
  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, data: Partial<Patient>) => void;
  /** Запись в истории визитов для «был в другой клинике» */
  syncOtherClinicVisitForPatient: (patient: Patient) => void;
  /** Удалить пациента и связанные записи; false — не найден */
  deletePatient: (id: string) => boolean;
  addAppointment: (
    appointment: Appointment,
    options?: { skipFlush?: boolean }
  ) => void;
  updateAppointment: (
    id: string,
    data: Partial<Appointment>,
    options?: { skipFlush?: boolean }
  ) => void;
  setAssistantManualHours: (assistantId: string, date: string, hours: string) => void;
  addMedicalRecord: (record: MedicalRecord) => void;
  /** Удалить запись медкарты и снять ссылки с актов/планов; false — не найдена */
  deleteMedicalRecord: (id: string) => boolean;
  addTreatmentPlan: (plan: TreatmentPlan) => void;
  updateTreatmentPlan: (id: string, data: Partial<TreatmentPlan>) => void;
  /** Удалить план лечения и связанную заметку; false — не найден */
  deleteTreatmentPlan: (id: string) => boolean;
  addPayment: (payment: Payment) => void;
  addInvoice: (invoice: Invoice) => void;
  addWorkAct: (act: WorkAct) => void;
  updateWorkAct: (id: string, data: Partial<WorkAct>) => void;
  linkWorkActToMedicalRecord: (actId: string, recordId: string) => void;
  syncMedicalRecordForWorkAct: (act: WorkAct) => void;
  saveDoctorMonthSchedule: (schedule: DoctorMonthSchedule) => void;
  addPrepayment: (prepayment: PatientPrepayment) => void;
  updatePrepayment: (id: string, data: Partial<PatientPrepayment>) => void;
  payWorkAct: (actId: string, method?: PaymentMethod, amount?: number) => boolean;
  /** ready_for_payment → completed, если акт уже оплачен */
  repairPaidActAppointments: () => void;
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
      deletedLegalDocumentIds: [],
      deletedServiceIds: [],
      deletedWorkActIds: [],
      deletedPatientIds: [],
      deletedDoctorIds: [],
      deletedAppointmentIds: [],
      deletedMedicalRecordIds: [],
      deletedTreatmentPlanIds: [],
      doctorSchedules: freshState.doctorSchedules,
      prepayments: freshState.prepayments,
      assistantManualHours: freshState.assistantManualHours,
      userThemePreferences: freshState.userThemePreferences,
      enabledModules: defaultClinicModules(),
      clinicSyncPhase: "loading",
      clinicDataUnsaved: false,
      clinicSaveStatus: "idle",
      clinicServerNewerAvailable: false,
      clinicDataSaveError: null,
      clinicSavePausedUntil: 0,

      setClinicSyncPhase: (phase) => set({ clinicSyncPhase: phase }),
      setClinicDataUnsaved: (unsaved) => set({ clinicDataUnsaved: unsaved }),
      setClinicSaveStatus: (status) => set({ clinicSaveStatus: status }),
      setClinicServerNewerAvailable: (available) =>
        set({ clinicServerNewerAvailable: available }),
      setClinicDataSaveError: (error) => set({ clinicDataSaveError: error }),
      pauseClinicAutoSave: (ms = 8000) =>
        set({ clinicSavePausedUntil: Date.now() + ms, clinicDataSaveError: null, clinicSaveStatus: "idle" }),

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
        clearPendingClinicSnapshot();
        const userThemePreferences = mergeThemePreferences(
          get().userThemePreferences,
          readThemePreferencesFromStorage()
        );
        persistThemePreferencesToStorage(userThemePreferences);
        clearPersistedClinicData();
        set({
          ...createFreshPersistedState(),
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
          clinicSaveStatus: "idle",
          clinicServerNewerAvailable: false,
          clinicDataSaveError: null,
        });
      },

      updateClinicSettings: (data) => {
        set((s) => {
          const next = { ...s.clinicSettings, ...data };
          if (data.weeklySchedule) {
            next.workHours = formatWeeklyScheduleSummary(data.weeklySchedule);
          }
          return { clinicSettings: next };
        });
      },

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

      addDoctor: (doctor) => {
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
            doctors: [doctor, ...s.doctors.filter((d) => d.id !== doctor.id)],
            deletedDoctorIds: (s.deletedDoctorIds ?? []).filter((id) => id !== doctor.id),
            doctorSchedules: scheduleEntry
              ? [scheduleEntry, ...schedules.filter((sch) => sch.doctorId !== doctor.id)]
              : schedules,
          };
        });
      },

      setDoctors: (doctors) => set({ doctors }),

      updateDoctor: (id, data) => {
        set((s) => ({
          doctors: s.doctors.map((d) => (d.id === id ? { ...d, ...data } : d)),
        }));
      },

      removeDoctor: (id, options) => {
        set((s) => {
          const schedules = s.doctorSchedules ?? [];
          return {
            doctors: s.doctors.filter((d) => d.id !== id),
            deletedDoctorIds: [...new Set([...(s.deletedDoctorIds ?? []), id])],
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
          assistantManualHours: Object.fromEntries(
            Object.entries(s.assistantManualHours).filter(([key]) => key !== id)
          ),
          workActs: s.workActs.map((act) =>
            act.doctorId === id ? { ...act, doctorId: undefined } : act
          ),
          };
        });
      },

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

      addClinicExpense: (expense) => {
        set((s) => ({ clinicExpenses: [expense, ...s.clinicExpenses] }));
      },

      removeClinicExpense: (id) => {
        set((s) => ({
          clinicExpenses: s.clinicExpenses.filter((e) => e.id !== id),
        }));
      },

      addLegalDocument: (doc) => {
        set((s) => ({
          legalDocuments: [doc, ...s.legalDocuments.filter((d) => d.id !== doc.id)],
          deletedLegalDocumentIds: (s.deletedLegalDocumentIds ?? []).filter(
            (documentId) => documentId !== doc.id
          ),
        }));
        // Юр. документы — через /api/clinic/legal/*; полный PUT откатывал файл/название.
      },

      updateLegalDocument: (id, data) => {
        set((s) => ({
          legalDocuments: s.legalDocuments.map((d) =>
            d.id === id ? { ...d, ...data } : d
          ),
        }));
      },

      removeLegalDocument: (id) => {
        set((s) => ({
          legalDocuments: s.legalDocuments.filter((d) => d.id !== id),
          deletedLegalDocumentIds: [...new Set([...(s.deletedLegalDocumentIds ?? []), id])],
        }));
      },

      addService: (service) => {
        if (!canManageServices(get().currentRole)) return;
        set((s) => ({
          services: [normalizeServiceFields(service), ...s.services],
          deletedServiceIds: (s.deletedServiceIds ?? []).filter(
            (serviceId) => serviceId !== service.id
          ),
        }));
        // Прайс — через /api/clinic/services/*; полный PUT откатывал правки.
      },

      updateService: (id, data) => {
        if (!canManageServices(get().currentRole)) return;
        set((s) => ({
          services: s.services.map((svc) =>
            svc.id === id ? normalizeServiceFields({ ...svc, ...data }) : svc
          ),
        }));
      },

      removeService: (id) => {
        if (!canManageServices(get().currentRole)) return;
        set((s) => ({
          services: s.services.filter((svc) => svc.id !== id),
          deletedServiceIds: [...new Set([...(s.deletedServiceIds ?? []), id])],
        }));
      },

      addPatient: (patient) => {
        set((s) => ({
          patients: [patient, ...s.patients],
          teethByPatient: { ...s.teethByPatient, [patient.id]: generateDefaultTeeth() },
          deletedPatientIds: (s.deletedPatientIds ?? []).filter((id) => id !== patient.id),
        }));
      },

      updatePatient: (id, data) => {
        set((s) => ({
          patients: s.patients.map((p) => (p.id === id ? { ...p, ...data } : p)),
        }));
      },

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
          const removedAppointmentIds = s.appointments
            .filter((a) => a.patientId === id)
            .map((a) => a.id);
          const removedWorkActIds = s.workActs
            .filter((a) => a.patientId === id)
            .map((a) => a.id);
          const removedMedicalRecordIds = s.medicalRecords
            .filter((r) => r.patientId === id)
            .map((r) => r.id);
          const removedTreatmentPlanIds = s.treatmentPlans
            .filter((p) => p.patientId === id)
            .map((p) => p.id);
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
            deletedPatientIds: [...new Set([...(s.deletedPatientIds ?? []), id])],
            deletedAppointmentIds: [
              ...new Set([...(s.deletedAppointmentIds ?? []), ...removedAppointmentIds]),
            ],
            deletedWorkActIds: [
              ...new Set([...(s.deletedWorkActIds ?? []), ...removedWorkActIds]),
            ],
            deletedMedicalRecordIds: [
              ...new Set([...(s.deletedMedicalRecordIds ?? []), ...removedMedicalRecordIds]),
            ],
            deletedTreatmentPlanIds: [
              ...new Set([...(s.deletedTreatmentPlanIds ?? []), ...removedTreatmentPlanIds]),
            ],
          };
        });
        return true;
      },

      addAppointment: (appointment, options) => {
        const result = applyCreateAppointmentToPersistedState(
          pickPersistedState(get()),
          appointment
        );
        if (!result.ok || result.alreadyApplied) {
          if (result.ok && result.alreadyApplied) return;
          return;
        }
        const n = result.state;
        set({
          appointments: n.appointments,
          patients: n.patients,
          deletedAppointmentIds: n.deletedAppointmentIds ?? [],
        });
      },

      updateAppointment: (id, data, options) => {
        const result = applyUpdateAppointmentToPersistedState(
          pickPersistedState(get()),
          id,
          data
        );
        if (!result.ok) return;
        if (result.alreadyApplied) return;
        const n = result.state;
        set({
          appointments: n.appointments,
          patients: n.patients,
        });
      },

      setAssistantManualHours: (assistantId, date, hours) => {
        set((s) => {
          const next: AssistantManualHoursMap = { ...s.assistantManualHours };
          const byDay = { ...(next[assistantId] ?? {}) };
          const trimmed = hours.trim();
          if (!trimmed) delete byDay[date];
          else byDay[date] = hours;
          if (Object.keys(byDay).length === 0) delete next[assistantId];
          else next[assistantId] = byDay;
          return { assistantManualHours: next };
        });
      },

      addMedicalRecord: (record) => {
        set((s) => ({ medicalRecords: [record, ...s.medicalRecords] }));
      },

      deleteMedicalRecord: (id) => {
        if (!get().medicalRecords.some((r) => r.id === id)) return false;
        set((s) => ({
          medicalRecords: s.medicalRecords.filter((r) => r.id !== id),
          workActs: s.workActs.map((a) =>
            a.medicalRecordId === id ? { ...a, medicalRecordId: undefined } : a
          ),
          treatmentPlans: s.treatmentPlans.map((p) =>
            p.medicalRecordId === id ? { ...p, medicalRecordId: undefined } : p
          ),
          deletedMedicalRecordIds: [...new Set([...(s.deletedMedicalRecordIds ?? []), id])],
        }));
        return true;
      },

      addTreatmentPlan: (plan) => {
        set((s) => ({ treatmentPlans: [plan, ...s.treatmentPlans] }));
      },

      updateTreatmentPlan: (id, data) => {
        set((s) => ({
          treatmentPlans: s.treatmentPlans.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        }));
      },

      deleteTreatmentPlan: (id) => {
        if (!get().treatmentPlans.some((p) => p.id === id)) return false;
        const linkedNoteId = treatmentPlanNoteId(id);
        set((s) => ({
          treatmentPlans: s.treatmentPlans.filter((p) => p.id !== id),
          patientNotes: s.patientNotes.filter(
            (n) => n.sourceTreatmentPlanId !== id && n.id !== linkedNoteId
          ),
          deletedTreatmentPlanIds: [...new Set([...(s.deletedTreatmentPlanIds ?? []), id])],
        }));
        return true;
      },

      addPayment: (payment) => {
        set((s) => ({ payments: [payment, ...s.payments] }));
      },

      addInvoice: (invoice) => {
        set((s) => ({ invoices: [invoice, ...s.invoices] }));
      },

      getNextActNumber: () => {
        const s = get();
        // Не доверяем только локальному счётчику: при одновременной работе врачей
        // он может отставать — берём max(счётчик, номера уже существующих актов).
        const n = allocateNextActSequence(s.workActs, s.prepayments ?? [], s.actCounter);
        set({ actCounter: n + 1 });
        return formatWorkActNumber(n);
      },

      addWorkAct: (act) => {
        set((s) => {
          const appointments = syncVisitForWorkAct(s.appointments, act, s.payments);
          return {
            workActs: [act, ...s.workActs],
            appointments,
            patients: withPatientVisitFields(s.patients, appointments, act.patientId),
          };
        });
      },

      updateWorkAct: (id, data) => {
        set((s) => {
          const workActs = s.workActs.map((a) => (a.id === id ? { ...a, ...data } : a));
          const act = workActs.find((a) => a.id === id);
          if (!act) return { workActs };

          const appointments = syncVisitForWorkAct(s.appointments, act, s.payments);
          const linked = findInvoiceForAct(s.invoices, act);
          const base = {
            workActs,
            appointments,
            patients: withPatientVisitFields(s.patients, appointments, act.patientId),
          };
          if (!linked) return base;

          return {
            ...base,
            invoices: s.invoices.map((inv) =>
              inv.id === linked.id ? patchInvoiceFromWorkAct(inv, act) : inv
            ),
          };
        });
      },

      saveDoctorMonthSchedule: (schedule) => {
        set((s) => {
          const schedules = s.doctorSchedules ?? [];
          const rest = schedules.filter(
            (x) => !(x.doctorId === schedule.doctorId && x.month === schedule.month)
          );
          return { doctorSchedules: [schedule, ...rest] };
        });
      },

      addPrepayment: (prepayment) => {
        set((s) => {
          const prepayments = s.prepayments ?? [];
          return {
            prepayments: [prepayment, ...prepayments],
          };
        });
      },

      updatePrepayment: (id, data) => {
        set((s) => ({
          prepayments: (s.prepayments ?? []).map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        }));
      },

      linkWorkActToMedicalRecord: (actId, recordId) => {
        set((s) => ({
          workActs: s.workActs.map((a) =>
            a.id === actId ? { ...a, medicalRecordId: recordId } : a
          ),
          medicalRecords: s.medicalRecords.map((r) =>
            r.id === recordId ? { ...r, workActId: actId } : r
          ),
        }));
      },

      syncMedicalRecordForWorkAct: (act) => {
        const recommendations = buildWorkActMedicalRecommendations(act);
        set((s) => {
          const linked = s.medicalRecords.some((r) => r.workActId === act.id);
          if (!linked) return s;
          return {
            medicalRecords: s.medicalRecords.map((r) =>
              r.workActId === act.id ? { ...r, recommendations } : r
            ),
          };
        });
      },

      payWorkAct: (actId, method = "cash", amount?: number) => {
        const result = applyPayWorkActToPersistedState(pickPersistedState(get()), {
          actId,
          method,
          amount,
        });
        if (!result.ok) return false;
        const n = result.state;
        set({
          workActs: n.workActs,
          payments: n.payments,
          invoices: n.invoices,
          patients: n.patients,
          appointments: n.appointments,
          medicalRecords: n.medicalRecords,
          teethByPatient: n.teethByPatient,
        });
        return true;
      },

      repairPaidActAppointments: () => {
        const state = get();
        const deletedActIds = new Set(state.deletedWorkActIds ?? []);
        let appointments = state.appointments;
        const patientIds = new Set<string>();
        for (const act of state.workActs) {
          if (act.actType === "prepayment" || deletedActIds.has(act.id)) continue;
          appointments = syncVisitForWorkAct(appointments, act, state.payments);
          patientIds.add(act.patientId);
          if (isWorkActFullyPaid(act, state.payments)) {
            appointments = syncAppointmentsAfterActPaid(appointments, act);
          }
        }
        if (appointments === state.appointments) return;
        let patients = state.patients;
        for (const patientId of patientIds) {
          patients = withPatientVisitFields(patients, appointments, patientId);
        }
        set({ appointments, patients });
      },

      deleteWorkAct: (actId) => {
        const state = get();
        const act = state.workActs.find((a) => a.id === actId);
        if (!act) return false;

        const reverseAmount = getWorkActPaidAmount(state.payments, actId);

        set((s) => {
          const beforeIds = new Set(s.appointments.map((a) => a.id));
          const appointments = removeSyntheticVisitForWorkAct(
            s.appointments.map((a) => {
              const linkedByWorkActId = a.workActId === actId;
              const linkedByAppointmentId =
                act.appointmentId != null && a.id === act.appointmentId;
              if (!linkedByWorkActId && !linkedByAppointmentId) return a;
              return detachAppointmentFromWorkAct(a);
            }),
            actId
          );
          const removedAppointmentIds = [...beforeIds].filter(
            (id) => !appointments.some((a) => a.id === id)
          );
          let patients = s.patients.map((p) => {
            if (p.id !== act.patientId) return p;
            // Инверсия payWorkAct: balance += payAmount - actTotal (при первом платеже)
            const nextBalance =
              reverseAmount > 0
                ? p.balance - reverseAmount + act.totalAmount
                : p.balance;
            const nextSpent =
              reverseAmount > 0
                ? Math.max(0, p.totalSpent - reverseAmount)
                : p.totalSpent;
            const status =
              nextBalance < 0
                ? ("debtor" as const)
                : p.status === "debtor" && nextBalance >= 0
                  ? ("active" as const)
                  : p.status;
            return {
              ...p,
              totalSpent: nextSpent,
              balance: nextBalance,
              status,
            };
          });
          patients = withPatientVisitFields(patients, appointments, act.patientId);
          return {
            workActs: s.workActs.filter((a) => a.id !== actId),
            deletedWorkActIds: [...new Set([...(s.deletedWorkActIds ?? []), actId])],
            deletedAppointmentIds: [
              ...new Set([...(s.deletedAppointmentIds ?? []), ...removedAppointmentIds]),
            ],
            invoices: s.invoices.filter(
              (inv) => inv.workActId !== actId && inv.id !== act.invoiceId
            ),
            payments: s.payments.filter((p) => p.workActId !== actId),
            patients,
            medicalRecords: s.medicalRecords.map((r) =>
              r.workActId === actId ? { ...r, workActId: undefined } : r
            ),
            appointments,
            prepayments: (s.prepayments ?? []).map((p) =>
              p.workActId === actId
                ? { ...p, workActId: undefined, actNumber: undefined }
                : p
            ),
          };
        });
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

      replacePersistedState: (data) => {
        const repaired = repairFinancialCoupling(data);
        set((s) => ({
          doctors: repaired.doctors ?? [],
          services: migrateServices(repaired.services ?? []),
          cabinets: repaired.cabinets ?? [],
          patients: repaired.patients ?? [],
          appointments: repaired.appointments ?? [],
          medicalRecords: repaired.medicalRecords ?? [],
          treatmentPlans: repaired.treatmentPlans ?? [],
          payments: repaired.payments ?? [],
          invoices: repaired.invoices ?? [],
          workActs: repaired.workActs ?? [],
          actCounter: repaired.actCounter ?? 1,
          warehouse: repaired.warehouse ?? [],
          tasks: repaired.tasks ?? [],
          onlineBookings: repaired.onlineBookings ?? [],
          patientFiles: repaired.patientFiles ?? [],
          patientNotes: repaired.patientNotes ?? [],
          teethByPatient: repaired.teethByPatient ?? {},
          clinicSettings: repaired.clinicSettings,
          documentTemplates: repaired.documentTemplates ?? [],
          clinicExpenses: repaired.clinicExpenses ?? [],
          legalDocuments: repaired.legalDocuments ?? [],
          deletedLegalDocumentIds: repaired.deletedLegalDocumentIds ?? [],
          deletedServiceIds: repaired.deletedServiceIds ?? [],
          deletedWorkActIds: repaired.deletedWorkActIds ?? [],
          deletedPatientIds: repaired.deletedPatientIds ?? [],
          deletedDoctorIds: repaired.deletedDoctorIds ?? [],
          deletedAppointmentIds: repaired.deletedAppointmentIds ?? [],
          deletedMedicalRecordIds: repaired.deletedMedicalRecordIds ?? [],
          deletedTreatmentPlanIds: repaired.deletedTreatmentPlanIds ?? [],
          doctorSchedules: repaired.doctorSchedules ?? [],
          prepayments: repaired.prepayments ?? [],
          assistantManualHours: normalizeAssistantManualHours(repaired.assistantManualHours),
          userThemePreferences: mergeThemePreferences(
            repaired.userThemePreferences,
            readThemePreferencesFromStorage(),
            s.userThemePreferences
          ),
        }));
      },

      hydratePersistedState: (data) =>
        set((s) => {
          const patients = mergeEntityListWithTombstones(
            data.patients ?? [],
            s.patients,
            data.deletedPatientIds,
            s.deletedPatientIds
          );
          const appointments = mergeEntityListWithTombstones(
            data.appointments ?? [],
            s.appointments,
            data.deletedAppointmentIds,
            s.deletedAppointmentIds
          );
          const medicalRecords = mergeEntityListWithTombstones(
            data.medicalRecords ?? [],
            s.medicalRecords,
            data.deletedMedicalRecordIds,
            s.deletedMedicalRecordIds
          );
          const treatmentPlans = mergeEntityListWithTombstones(
            data.treatmentPlans ?? [],
            s.treatmentPlans,
            data.deletedTreatmentPlanIds,
            s.deletedTreatmentPlanIds
          );
          const hydrated = applyAllDeletionTombstones({
            ...s,
            ...(() => {
              const doctors = mergeEntityListWithTombstones(
                data.doctors ?? [],
                s.doctors,
                data.deletedDoctorIds,
                s.deletedDoctorIds
              );
              return {
                doctors: doctors.items,
                deletedDoctorIds: doctors.deletedIds,
              };
            })(),
            ...mergeServicesState(
              data.services ?? [],
              s.services,
              data.deletedServiceIds,
              s.deletedServiceIds
            ),
            cabinets: mergeByIdPreferLocal(data.cabinets ?? [], s.cabinets),
            patients: patients.items,
            deletedPatientIds: patients.deletedIds,
            appointments: appointments.items,
            deletedAppointmentIds: appointments.deletedIds,
            medicalRecords: medicalRecords.items,
            deletedMedicalRecordIds: medicalRecords.deletedIds,
            treatmentPlans: treatmentPlans.items,
            deletedTreatmentPlanIds: treatmentPlans.deletedIds,
            payments: mergeByIdPreferLocal(data.payments ?? [], s.payments),
            invoices: mergeByIdPreferLocal(data.invoices ?? [], s.invoices),
            ...mergeWorkActsState(
              data.workActs ?? [],
              s.workActs,
              data.deletedWorkActIds,
              s.deletedWorkActIds
            ),
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
            ...mergeLegalDocumentsState(
              data.legalDocuments ?? [],
              s.legalDocuments,
              data.deletedLegalDocumentIds,
              s.deletedLegalDocumentIds
            ),
            doctorSchedules: mergeDoctorSchedules(data.doctorSchedules ?? [], s.doctorSchedules),
            prepayments: mergeByIdPreferLocal(data.prepayments ?? [], s.prepayments),
            assistantManualHours: mergeAssistantManualHours(
              s.assistantManualHours,
              data.assistantManualHours ?? {}
            ),
            userThemePreferences: mergeThemePreferences(
              data.userThemePreferences,
              readThemePreferencesFromStorage(),
              s.userThemePreferences
            ),
          });
          return {
            doctors: hydrated.doctors,
            services: hydrated.services,
            cabinets: hydrated.cabinets,
            patients: hydrated.patients,
            appointments: hydrated.appointments,
            medicalRecords: hydrated.medicalRecords,
            treatmentPlans: hydrated.treatmentPlans,
            payments: hydrated.payments,
            invoices: hydrated.invoices,
            workActs: hydrated.workActs,
            actCounter: hydrated.actCounter,
            warehouse: hydrated.warehouse,
            tasks: hydrated.tasks,
            onlineBookings: hydrated.onlineBookings,
            patientFiles: hydrated.patientFiles,
            patientNotes: hydrated.patientNotes,
            teethByPatient: hydrated.teethByPatient,
            clinicSettings: hydrated.clinicSettings,
            documentTemplates: hydrated.documentTemplates,
            clinicExpenses: hydrated.clinicExpenses,
            legalDocuments: hydrated.legalDocuments,
            deletedLegalDocumentIds: hydrated.deletedLegalDocumentIds ?? [],
            deletedServiceIds: hydrated.deletedServiceIds ?? [],
            deletedWorkActIds: hydrated.deletedWorkActIds ?? [],
            deletedPatientIds: hydrated.deletedPatientIds ?? [],
            deletedDoctorIds: hydrated.deletedDoctorIds ?? [],
            deletedAppointmentIds: hydrated.deletedAppointmentIds ?? [],
            deletedMedicalRecordIds: hydrated.deletedMedicalRecordIds ?? [],
            deletedTreatmentPlanIds: hydrated.deletedTreatmentPlanIds ?? [],
            doctorSchedules: hydrated.doctorSchedules,
            prepayments: hydrated.prepayments,
            assistantManualHours: hydrated.assistantManualHours,
            userThemePreferences: hydrated.userThemePreferences,
          };
        }),

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
