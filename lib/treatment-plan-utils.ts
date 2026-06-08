import type { DiscountType, TreatmentPlanItem } from "./types.ts";
import { calcDiscountTotals } from "./discount-utils.ts";

export function calcPlanTotals(
  items: TreatmentPlanItem[],
  discountType: DiscountType,
  discount: number
) {
  const totalAmount = items.reduce((s, it) => s + it.price, 0);
  const { totalAmount: finalAmount, discountValue } = calcDiscountTotals(
    totalAmount,
    discountType,
    discount
  );
  return { totalAmount, finalAmount, discountValue };
}
