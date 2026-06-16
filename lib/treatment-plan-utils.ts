import type { DiscountType, TreatmentPlanItem } from "./types";
import { calcDiscountTotals } from "./discount-utils";
import { planItemLineTotal } from "./treatment-plan-item-utils";

export function calcPlanTotals(
  items: TreatmentPlanItem[],
  discountType: DiscountType,
  discount: number
) {
  const totalAmount = items.reduce((s, it) => s + planItemLineTotal(it), 0);
  const { totalAmount: finalAmount, discountValue } = calcDiscountTotals(
    totalAmount,
    discountType,
    discount
  );
  return { totalAmount, finalAmount, discountValue };
}
