import { NAV_ITEMS } from "./constants";
import {
  isModuleEnabled,
  NAV_HREF_TO_MODULE,
  resolvePathModule,
  type ClinicModules,
} from "./modules";
import type { UserRole } from "./types";

const SERVICES_CATALOG_PATH = "/warehouse";
const TREATMENT_PLANS_PATH = "/treatment-plans";

function isServicesCatalogPath(path: string): boolean {
  return path === SERVICES_CATALOG_PATH || path.startsWith(`${SERVICES_CATALOG_PATH}/`);
}

function isAppointmentsPath(path: string): boolean {
  return path === "/appointments" || path.startsWith("/appointments/");
}

function isTreatmentPlansPath(path: string): boolean {
  return path === TREATMENT_PLANS_PATH || path.startsWith(`${TREATMENT_PLANS_PATH}/`);
}

/** Прайс услуг: врач и партнёр всегда видят только чтение; остальные — при включённом модуле «склад» */
export function canAccessServicesCatalog(
  role: UserRole,
  modules?: ClinicModules
): boolean {
  if (role === "doctor" || role === "partner") return true;
  return !modules || isModuleEnabled(modules, "warehouse");
}

/** Планы лечения: врач всегда видит все планы клиники */
export function canAccessTreatmentPlansCatalog(
  role: UserRole,
  modules?: ClinicModules
): boolean {
  if (role === "doctor") return true;
  if (role === "partner") return false;
  return !modules || isModuleEnabled(modules, "treatment_plans");
}

export function isAccountSettingsPath(path: string): boolean {
  return (
    path === "/settings" ||
    path.startsWith("/settings/") ||
    path === "/profile" ||
    path.startsWith("/profile/")
  );
}

export function canAccessPath(
  role: UserRole,
  pathname: string,
  modules?: ClinicModules
): boolean {
  const path = pathname.split("?")[0];
  if (path === "/" || path === "/login") return true;
  // Публичные страницы подписи / привязки телефона (не пункты NAV)
  if (path === "/sign" || path.startsWith("/sign/")) return true;

  if (isAccountSettingsPath(path)) {
    const settingsNav = NAV_ITEMS.find((nav) => nav.href === "/settings");
    return settingsNav?.roles.includes(role) ?? false;
  }

  // Врач / партнёр: прайс на /warehouse (proxy вызывает без modules — отдельная ветка)
  if (isServicesCatalogPath(path) && (role === "doctor" || role === "partner")) {
    return canAccessServicesCatalog(role, modules);
  }

  if (isAppointmentsPath(path) && role === "partner") {
    return true;
  }

  if (isTreatmentPlansPath(path) && role === "doctor") {
    return canAccessTreatmentPlansCatalog(role, modules);
  }

  const moduleId = resolvePathModule(path);
  if (modules && moduleId && !isModuleEnabled(modules, moduleId)) {
    if (isServicesCatalogPath(path) && canAccessServicesCatalog(role, modules)) {
      // read-only catalog for doctors / partner
    } else if (isTreatmentPlansPath(path) && canAccessTreatmentPlansCatalog(role, modules)) {
      // все планы клиники для врачей
    } else if (isAppointmentsPath(path) && role === "partner") {
      // партнёр всегда видит расписание
    } else {
      return false;
    }
  }

  const item = NAV_ITEMS.find(
    (nav) => path === nav.href || path.startsWith(`${nav.href}/`)
  );
  if (!item) return false;
  return item.roles.includes(role);
}

export function filterNavByModules<T extends { href: string }>(
  items: T[],
  modules?: ClinicModules,
  role?: UserRole
): T[] {
  if (!modules) return items;
  return items.filter((item) => {
    if (item.href === "/profile" || item.href === "/settings") return true;
    if (item.href === "/appointments" && role === "partner") return true;
    if (item.href === SERVICES_CATALOG_PATH && role) {
      return canAccessServicesCatalog(role, modules);
    }
    if (item.href === TREATMENT_PLANS_PATH && role) {
      return canAccessTreatmentPlansCatalog(role, modules);
    }
    const moduleId = NAV_HREF_TO_MODULE[item.href];
    if (!moduleId) return true;
    return isModuleEnabled(modules, moduleId);
  });
}

/** Пункты бокового меню для роли с учётом модулей клиники */
export function navItemsForRole(role: UserRole, modules?: ClinicModules) {
  const roleNav = NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(role) ||
      (item.href === SERVICES_CATALOG_PATH && canAccessServicesCatalog(role, modules)) ||
      (item.href === TREATMENT_PLANS_PATH && canAccessTreatmentPlansCatalog(role, modules))
  );
  return filterNavByModules(roleNav, modules, role);
}

/** Технический прайс — не для партнёрской клиники */
export function canViewTechnicalServices(role: UserRole): boolean {
  return role !== "partner";
}

/** Статус пациента (active/vip/debtor/archived) — только управление клиникой */
export function canManagePatientStatus(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Статус приёма (scheduled → cancelled и т.д.) — только admin/owner; врач — отдельно через complete/act */
export function canManageAppointmentStatus(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Врач может завершить приём без смены прочих статусов */
export function canDoctorCompleteAppointment(role: UserRole): boolean {
  return role === "doctor";
}

/** Справочник услуг (прайс): создание и редактирование */
export function canManageServices(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Юр. отдел: создание и редактирование документов */
export function canManageLegalDocuments(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Удаление актов — только владелец клиники */
export function canDeleteWorkActs(role: UserRole): boolean {
  return role === "owner";
}

/** Удаление пациентов — только владелец клиники */
export function canDeletePatients(role: UserRole): boolean {
  return role === "owner";
}

/** Удаление планов лечения — только владелец клиники */
export function canDeleteTreatmentPlans(role: UserRole): boolean {
  return role === "owner";
}

/** Удаление записей медкарты — только владелец клиники */
export function canDeleteMedicalRecords(role: UserRole): boolean {
  return role === "owner";
}

/** Удаление расходов клиники — только владелец */
export function canDeleteClinicExpenses(role: UserRole): boolean {
  return role === "owner";
}

/**
 * Телефоны пациентов:
 * - owner / admin (и assistant) — видны в UI
 * - doctor — скрыты в UI; на GET снимок тоже без телефонов
 */
export function canViewPatientPhone(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "assistant";
}

export function defaultPathForRole(role: UserRole, modules?: ClinicModules): string {
  return navItemsForRole(role, modules)[0]?.href ?? "/settings";
}
