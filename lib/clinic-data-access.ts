import type { ClinicPersistedState } from "./clinic-persisted-state";
import type { UserRole } from "./types";

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
