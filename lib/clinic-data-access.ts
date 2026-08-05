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
