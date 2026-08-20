import { normalizeServiceFields } from "@/lib/service-categories";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { Service } from "@/lib/types";

export type ApplyServiceResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      serviceId: string;
      alreadyApplied: boolean;
    };

function servicesEqual(a: Service, b: Service): boolean {
  try {
    return JSON.stringify(normalizeServiceFields(a)) === JSON.stringify(normalizeServiceFields(b));
  } catch {
    return false;
  }
}

/** Создать/обновить услугу в снимке (клиент побеждает для этого id). */
export function applyUpsertServiceToPersistedState(
  state: ClinicPersistedState,
  service: Service
): ApplyServiceResult {
  const id = service.id?.trim();
  if (!id) return { ok: false, error: "Не указана услуга" };

  const normalized = normalizeServiceFields({ ...service, id });
  if (!normalized.name.trim() && normalized.category !== "Техническая") {
    return { ok: false, error: "Укажите название услуги" };
  }
  if (!(normalized.price > 0)) {
    return { ok: false, error: "Цена должна быть больше 0" };
  }

  const existing = state.services.find((s) => s.id === id);
  if (existing && servicesEqual(existing, normalized)) {
    return {
      ok: true,
      state,
      serviceId: id,
      alreadyApplied: true,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      services: existing
        ? state.services.map((s) => (s.id === id ? normalized : s))
        : [normalized, ...state.services],
      deletedServiceIds: (state.deletedServiceIds ?? []).filter((tombstoneId) => tombstoneId !== id),
    },
    serviceId: id,
    alreadyApplied: false,
  };
}

/** Удалить услугу и поставить tombstone. */
export function applyDeleteServiceToPersistedState(
  state: ClinicPersistedState,
  serviceId: string
): ApplyServiceResult {
  const id = serviceId?.trim();
  if (!id) return { ok: false, error: "Не указана услуга" };

  const exists = state.services.some((s) => s.id === id);
  const alreadyTombstoned = (state.deletedServiceIds ?? []).includes(id);
  if (!exists) {
    if (alreadyTombstoned) {
      return { ok: true, state, serviceId: id, alreadyApplied: true };
    }
    return { ok: false, error: "Услуга не найдена" };
  }

  return {
    ok: true,
    state: {
      ...state,
      services: state.services.filter((s) => s.id !== id),
      deletedServiceIds: [...new Set([...(state.deletedServiceIds ?? []), id])],
    },
    serviceId: id,
    alreadyApplied: false,
  };
}
