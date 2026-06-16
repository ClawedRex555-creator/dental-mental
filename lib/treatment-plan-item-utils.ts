import type { TreatmentPlanItem } from "./types";

export function normalizePlanItemQuantity(quantity?: number): number {
  if (!quantity || !Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.floor(quantity);
}

export function planItemLineTotal(item: TreatmentPlanItem): number {
  return item.price * normalizePlanItemQuantity(item.quantity);
}

export function findMatchingPlanItemIndex(
  items: TreatmentPlanItem[],
  serviceId: string,
  toothNumber?: number
): number {
  return items.findIndex(
    (it) =>
      it.serviceId === serviceId &&
      (toothNumber == null ? it.toothNumber == null : it.toothNumber === toothNumber)
  );
}
