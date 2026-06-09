import { NAV_ITEMS } from "./constants";
import {
  isModuleEnabled,
  resolvePathModule,
  type ClinicModules,
} from "./modules";
import type { UserRole } from "./types";
import {
  canAccessPath,
  canAccessServicesCatalog,
  isAccountSettingsPath,
  navItemsForRole,
} from "./rbac";

/** Куда безопасно перенаправить, если текущий раздел отключён (без циклов) */
export function resolveSafeRedirectPath(
  role: UserRole,
  modules: ClinicModules,
  currentPathname?: string
): string {
  const current = currentPathname?.split("?")[0] ?? "";

  const items = navItemsForRole(role, modules);

  for (const item of items) {
    if (item.href === current) continue;
    if (canAccessPath(role, item.href, modules)) return item.href;
  }

  const settingsNav = NAV_ITEMS.find((nav) => nav.href === "/settings");
  if (settingsNav?.roles.includes(role) && current !== "/settings" && current !== "/profile") {
    return "/settings";
  }

  return items[0]?.href ?? "/settings";
}

export function isPathBlockedByModules(
  pathname: string,
  modules: ClinicModules,
  role?: UserRole
): boolean {
  if (isAccountSettingsPath(pathname)) return false;
  const path = pathname.split("?")[0];
  if (
    (path === "/warehouse" || path.startsWith("/warehouse/")) &&
    role &&
    canAccessServicesCatalog(role, modules)
  ) {
    return false;
  }
  const moduleId = resolvePathModule(pathname);
  return moduleId != null && !isModuleEnabled(modules, moduleId);
}
