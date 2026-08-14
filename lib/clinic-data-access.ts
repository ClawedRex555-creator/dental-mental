import type { ClinicPersistedState } from "./clinic-persisted-state";
import type { Appointment, Patient, UserRole } from "./types";

/** Чтение полного snapshot (GET /api/clinic/data) */
export function canReadClinicDataSync(role: UserRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "doctor" ||
    role === "assistant" ||
    role === "accountant"
  );
}

/** Автосохранение полного snapshot (PUT /api/clinic/data) */
export function canWriteClinicDataSync(role: UserRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "doctor" ||
    role === "assistant"
  );
}

/** @deprecated используйте canReadClinicDataSync / canWriteClinicDataSync */
export function canAccessFullClinicDataSync(role: UserRole): boolean {
  return canWriteClinicDataSync(role);
}

/** Прайс меняют только owner/admin; остальные роли не перетирают services. */
export function preserveServicesForReadOnlyRoles(
  role: UserRole,
  incoming: ClinicPersistedState,
  existing: ClinicPersistedState | null | undefined
): ClinicPersistedState {
  if (!existing) return incoming;
  if (role === "owner" || role === "admin") return incoming;
  return {
    ...incoming,
    services: existing.services,
    deletedServiceIds: existing.deletedServiceIds ?? [],
  };
}

const PATIENT_PHI_PRESERVE_KEYS = [
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

/**
 * Пустой PHI с клиента не затирает непустой на сервере (stale cache / бывшая
 * редакция врача / битый merge). Аддитивно: заполненные поля не очищает.
 * Параметр role сохранён для совместимости вызовов; защита для всех write-ролей.
 */
export function preservePatientPhiForRedactedRoles(
  _role: UserRole,
  incoming: ClinicPersistedState,
  existing: ClinicPersistedState | null | undefined
): ClinicPersistedState {
  if (!existing) return incoming;

  const existingById = new Map(existing.patients.map((p) => [p.id, p]));
  return {
    ...incoming,
    patients: incoming.patients.map((patient) => {
      const prev = existingById.get(patient.id);
      if (!prev) return patient;
      const next: Patient = { ...patient };
      for (const key of PATIENT_PHI_PRESERVE_KEYS) {
        const incomingVal = patient[key];
        const prevVal = prev[key];
        const incomingEmpty =
          incomingVal == null ||
          (typeof incomingVal === "string" && incomingVal.trim() === "");
        if (incomingEmpty && prevVal != null && String(prevVal).trim() !== "") {
          (next as unknown as Record<string, unknown>)[key] = prevVal;
        }
      }
      if (
        (!patient.notificationPrefs?.telegramChatId ||
          !String(patient.notificationPrefs.telegramChatId).trim()) &&
        prev.notificationPrefs?.telegramChatId
      ) {
        next.notificationPrefs = {
          ...prev.notificationPrefs,
          ...patient.notificationPrefs,
          telegramChatId: prev.notificationPrefs.telegramChatId,
        };
      }
      return next;
    }),
  };
}

export type AccountantPatientSummary = Pick<
  Patient,
  "id" | "firstName" | "lastName" | "balance" | "totalSpent" | "status"
>;

/** Бухгалтер: только финансовые данные, пациенты без ПДн/мед. полей. */
export function filterClinicSnapshotForAccountant(
  state: ClinicPersistedState
): ClinicPersistedState {
  const patients: AccountantPatientSummary[] = state.patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    balance: p.balance,
    totalSpent: p.totalSpent,
    status: p.status,
  }));

  return {
    doctors: state.doctors.map((d) => ({
      ...d,
      phone: "",
      email: "",
      snils: undefined,
    })),
    services: state.services,
    cabinets: [],
    patients: patients as Patient[],
    // Бухгалтеру не нужны клинические поля приёмов — только id/дата/связь с актом
    appointments: state.appointments.map(
      (a): Appointment => ({
        id: a.id,
        patientId: a.patientId,
        doctorId: a.doctorId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMinutes: a.durationMinutes,
        status: a.status,
        price: a.price,
        paymentStatus: a.paymentStatus,
        workActId: a.workActId,
      })
    ),
    medicalRecords: [],
    treatmentPlans: [],
    payments: state.payments,
    invoices: state.invoices,
    workActs: state.workActs,
    actCounter: state.actCounter,
    warehouse: [],
    tasks: [],
    onlineBookings: [],
    patientFiles: [],
    patientNotes: [],
    teethByPatient: {},
    clinicSettings: state.clinicSettings,
    documentTemplates: [],
    clinicExpenses: state.clinicExpenses,
    legalDocuments: [],
    doctorSchedules: [],
    prepayments: state.prepayments,
    userThemePreferences: {},
    assistantManualHours: state.assistantManualHours ?? {},
  };
}
