import type { Doctor } from "@/lib/types";

/** Врачи для пациентского каталога: только role=doctor (не admin/partner/assistant). */
export function isPatientCatalogDoctor(d: Pick<Doctor, "role" | "status">): boolean {
  return d.status === "active" && (d.role === "doctor" || !d.role);
}
