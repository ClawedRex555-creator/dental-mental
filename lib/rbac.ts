import { NAV_ITEMS } from "./constants";
import {
  isModuleEnabled,
  NAV_HREF_TO_MODULE,
  resolvePathModule,
  type ClinicModules,
} from "./modules";
import type { UserRole } from "./types";

const SERVICES_CATALOG_PATH = "/warehouse";

function isServicesCatalogPath(path: string): boolean {
  return path === SERVICES_CATALOG_PATH || path.startsWith(`${SERVICES_CATALOG_PATH}/`);
}

/** Прайс услуг: врач всегда видит только чтение; остальные — при включённом модуле «склад» */
export function canAccessServicesCatalog(
  role: UserRole,
  modules?: ClinicModules
): boolean {
  if (role === "doctor") return true;
  return !modules || isModuleEnabled(modules, "warehouse");
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

  if (isAccountSettingsPath(path)) {
    const settingsNav = NAV_ITEMS.find((nav) => nav.href === "/settings");
    return settingsNav?.roles.includes(role) ?? false;
  }

  // Врач: прайс на /warehouse (proxy вызывает без modules — отдельная ветка)
  if (isServicesCatalogPath(path) && role === "doctor") {
    return canAccessServicesCatalog(role, modules);
  }

  const moduleId = resolvePathModule(path);
  if (modules && moduleId && !isModuleEnabled(modules, moduleId)) {
    if (isServicesCatalogPath(path) && canAccessServicesCatalog(role, modules)) {
      // read-only catalog for doctors
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
    if (item.href === SERVICES_CATALOG_PATH && role) {
      return canAccessServicesCatalog(role, modules);
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
      (item.href === SERVICES_CATALOG_PATH && canAccessServicesCatalog(role, modules))
  );
  return filterNavByModules(roleNav, modules, role);
}

/** Справочник услуг (прайс): создание и редактирование */
export function canManageServices(role: UserRole): boolean {
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

export function defaultPathForRole(role: UserRole, modules?: ClinicModules): string {
  return navItemsForRole(role, modules)[0]?.href ?? "/settings";
}
