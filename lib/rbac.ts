import { NAV_ITEMS } from "@/lib/constants";
import {
  isModuleEnabled,
  NAV_HREF_TO_MODULE,
  resolvePathModule,
  type ClinicModules,
} from "@/lib/modules";
import type { UserRole } from "@/lib/types";

export function canAccessPath(
  role: UserRole,
  pathname: string,
  modules?: ClinicModules
): boolean {
  const path = pathname.split("?")[0];
  if (path === "/" || path === "/login") return true;

  const moduleId = resolvePathModule(path);
  if (modules && moduleId && !isModuleEnabled(modules, moduleId)) {
    return false;
  }

  const item = NAV_ITEMS.find(
    (nav) => path === nav.href || path.startsWith(`${nav.href}/`)
  );
  if (!item) return false;
  return item.roles.includes(role);
}

export function filterNavByModules<T extends { href: string }>(
  items: T[],
  modules?: ClinicModules
): T[] {
  if (!modules) return items;
  return items.filter((item) => {
    const moduleId = NAV_HREF_TO_MODULE[item.href];
    if (!moduleId) return true;
    return isModuleEnabled(modules, moduleId);
  });
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
  const items = filterNavByModules(
    NAV_ITEMS.filter((nav) => nav.roles.includes(role)),
    modules
  );
  return items[0]?.href ?? "/appointments";
}
