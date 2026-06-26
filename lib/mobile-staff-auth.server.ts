import "server-only";

import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import type { UserRole } from "@/lib/types";

const STAFF_ROLES: UserRole[] = ["owner", "admin", "doctor", "assistant", "accountant"];

export function isStaffMobileSession(
  session: MobileTokenPayload | null
): session is MobileTokenPayload & { kind: "staff" } {
  return session?.kind === "staff" && STAFF_ROLES.includes(session.role as UserRole);
}

export function canViewAllStaffAppointments(role: UserRole | "patient"): boolean {
  return role === "owner" || role === "admin";
}
