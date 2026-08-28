import type { TreatmentPlan, TreatmentPlanCase } from "@/lib/types";
import { calcPlanRemaining } from "@/lib/treatment-plan-utils";

/** Объединить planIds без дублей, сохранив порядок. */
export function mergeCasePlanIds(
  existing: string[],
  toAdd: string[],
  toRemove: string[] = []
): string[] {
  const remove = new Set(toRemove);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...existing, ...toAdd]) {
    if (!id || remove.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function calcCaseTotals(
  caseItem: TreatmentPlanCase,
  plans: TreatmentPlan[]
) {
  const byId = new Map(plans.map((p) => [p.id, p]));
  let totalAmount = 0;
  let finalAmount = 0;
  let remainingAmount = 0;
  for (const id of caseItem.planIds) {
    const plan = byId.get(id);
    if (!plan) continue;
    totalAmount += plan.totalAmount;
    finalAmount += plan.finalAmount;
    remainingAmount += calcPlanRemaining(
      plan.items,
      plan.discountType ?? "percent",
      plan.discount ?? 0
    ).remainingAmount;
  }
  return { totalAmount, finalAmount, remainingAmount };
}

export function plansForCase(
  caseItem: TreatmentPlanCase,
  plans: TreatmentPlan[]
): TreatmentPlan[] {
  const byId = new Map(plans.map((p) => [p.id, p]));
  return caseItem.planIds
    .map((id) => byId.get(id))
    .filter((p): p is TreatmentPlan => Boolean(p));
}
