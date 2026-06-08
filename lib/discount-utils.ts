import type { DiscountType } from "./types.ts";

export function calcDiscountTotals(
  subtotal: number,
  discountType: DiscountType,
  discount: number
) {
  const discountValue =
    discountType === "percent"
      ? Math.round((subtotal * discount) / 100)
      : discount;
  const totalAmount = Math.max(0, subtotal - discountValue);
  return { subtotal, discountValue, totalAmount };
}
