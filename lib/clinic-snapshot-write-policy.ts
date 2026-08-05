import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { UserRole } from "@/lib/types";

function newTombstones(
  existing: string[] | undefined,
  incoming: string[] | undefined
): string[] {
  const prev = new Set(existing ?? []);
  return (incoming ?? []).filter((id) => !prev.has(id));
}

/**
 * Серверная политика деструктивных правок snapshot.
 * UI RBAC недостаточно: doctor/assistant не должны удалять пациентов/акты/медкарты.
 */
export function enforceClinicSnapshotWritePolicy(
  role: UserRole,
  existing: ClinicPersistedState | null | undefined,
  incoming: ClinicPersistedState
): { ok: true; data: ClinicPersistedState } | { ok: false; error: string } {
  let data = incoming;

  if (role !== "owner" && role !== "admin") {
    // Прайс только owner/admin (врач уже покрыт preserveServices; ассистент — здесь).
    if (existing) {
      data = {
        ...data,
        services: existing.services,
        deletedServiceIds: existing.deletedServiceIds ?? [],
      };
    }
  }

  if (!existing) {
    return { ok: true, data };
  }

  if (role !== "owner") {
    if (newTombstones(existing.deletedPatientIds, data.deletedPatientIds).length) {
      return { ok: false, error: "Удаление пациентов доступно только владельцу" };
    }
    if (newTombstones(existing.deletedWorkActIds, data.deletedWorkActIds).length) {
      return { ok: false, error: "Удаление актов доступно только владельцу" };
    }
    if (
      newTombstones(existing.deletedMedicalRecordIds, data.deletedMedicalRecordIds)
        .length
    ) {
      return { ok: false, error: "Удаление медкарт доступно только владельцу" };
    }
    if (
      newTombstones(existing.deletedTreatmentPlanIds, data.deletedTreatmentPlanIds)
        .length
    ) {
      return { ok: false, error: "Удаление планов лечения доступно только владельцу" };
    }
  }

  if (role !== "owner" && role !== "admin") {
    if (newTombstones(existing.deletedServiceIds, data.deletedServiceIds).length) {
      return { ok: false, error: "Удаление услуг доступно только администратору" };
    }
  }

  return { ok: true, data };
}

/** Редакция PHI для врача на GET (телефоны/документы скрыты как в UI). */
export function filterClinicSnapshotForDoctor(
  state: ClinicPersistedState
): ClinicPersistedState {
  return {
    ...state,
    patients: state.patients.map((p) => ({
      ...p,
      phone: "",
      email: undefined,
      snils: undefined,
      passportSeries: undefined,
      passportNumber: undefined,
      address: undefined,
      birthCertificateSeries: undefined,
      birthCertificateNumber: undefined,
      representativePassportSeries: undefined,
      representativePassportNumber: undefined,
      telegramChatId: undefined,
      notificationPrefs: p.notificationPrefs
        ? { ...p.notificationPrefs, telegramChatId: undefined }
        : undefined,
    })),
  };
}
