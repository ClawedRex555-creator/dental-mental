import type { ClinicPersistedState } from "./clinic-persisted-state";
import type { Patient, UserRole } from "./types";

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
  return role === "owner" || role === "admin" || role === "doctor" || role === "assistant";
}

/** @deprecated используйте canReadClinicDataSync / canWriteClinicDataSync */
export function canAccessFullClinicDataSync(role: UserRole): boolean {
  return canWriteClinicDataSync(role);
}

/** Врач видит прайс, но не может менять услуги при автосохранении snapshot. */
export function preserveServicesForReadOnlyRoles(
  role: UserRole,
  incoming: ClinicPersistedState,
  existing: ClinicPersistedState | null | undefined
): ClinicPersistedState {
  if (role !== "doctor" || !existing) return incoming;
  return { ...incoming, services: existing.services };
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
    doctors: state.doctors,
    services: state.services,
    cabinets: [],
    patients: patients as Patient[],
    appointments: state.appointments,
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
  };
}
