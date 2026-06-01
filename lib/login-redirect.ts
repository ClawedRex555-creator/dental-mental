import type { UserRole } from "@/lib/types";

/** Первый раздел после входа (без зависимости от modules на клиенте) */
const ROLE_HOME: Record<UserRole, string> = {
  owner: "/appointments",
  admin: "/appointments",
  doctor: "/appointments",
  assistant: "/appointments",
  accountant: "/finance",
};

export function loginRedirectForRole(role: UserRole): string {
  return ROLE_HOME[role] ?? "/appointments";
}
