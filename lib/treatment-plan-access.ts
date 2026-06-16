import type { TreatmentPlan, UserRole } from "./types";

/** Все врачи видят все планы клиники, не только где они «лечащий врач». */
export function treatmentPlansForViewer(
  plans: TreatmentPlan[],
  _viewer: { role: UserRole; staffId?: string }
): TreatmentPlan[] {
  return plans;
}
