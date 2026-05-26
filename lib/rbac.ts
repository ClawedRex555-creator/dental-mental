import { NAV_ITEMS } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

export function canAccessPath(role: UserRole, pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (path === "/" || path === "/login") return true;

  const item = NAV_ITEMS.find(
    (nav) => path === nav.href || path.startsWith(`${nav.href}/`)
  );
  if (!item) return true;
  return item.roles.includes(role);
}

export function defaultPathForRole(role: UserRole): string {
  const item = NAV_ITEMS.find((nav) => nav.roles.includes(role));
  return item?.href ?? "/appointments";
}
