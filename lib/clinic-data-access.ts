import type { UserRole } from "./types";

/** Полный snapshot клиники (GET/PUT /api/clinic/data) — только владелец и админ */
export function canAccessFullClinicDataSync(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}
