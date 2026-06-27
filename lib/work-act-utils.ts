import type { DiscountType, WorkAct, WorkActItem } from "./types";
import { calcDiscountTotals } from "./discount-utils";

export interface WorkActLineCalc {
  sum: number;
  discountPercent: number;
  totalAfterDiscount: number;
}

export function calcWorkActLine(item: WorkActItem): WorkActLineCalc {
  const sum = (item.quantity || 1) * (item.price || 0);
  const discountPercent = item.discountPercent ?? 0;
  const totalAfterDiscount = sum * (1 - discountPercent / 100);
  return { sum, discountPercent, totalAfterDiscount };
}

export function calcWorkActAmounts(
  items: WorkActItem[],
  discountType: DiscountType = "rubles",
  discount = 0
) {
  const lines = items.map(calcWorkActLine);
  const subtotalAmount = lines.reduce((s, l) => s + l.sum, 0);
  const afterRowDiscounts = lines.reduce((s, l) => s + l.totalAfterDiscount, 0);
  const { discountValue, totalAmount } = calcDiscountTotals(
    afterRowDiscounts,
    discountType,
    discount
  );
  return {
    lines,
    subtotalAmount,
    afterRowDiscounts,
    discountValue,
    totalAmount,
  };
}

export function getActDisplayNumber(actNumber: string, actDate: string): string {
  const d = new Date(actDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const legacy = actNumber.match(/^АВР-(\d+)-(\d+)$/);
  if (legacy) {
    return `${legacy[2]}-${month}/${legacy[1]}`;
  }
  return actNumber;
}

export function formatActShortDate(actDate: string): string {
  const d = new Date(actDate);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

export function getContractNumber(patientId: string): string {
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) {
    hash = (hash * 31 + patientId.charCodeAt(i)) >>> 0;
  }
  const digits = String(hash).padStart(12, "0").slice(-12);
  const tail = String(patientId.length % 10000).padStart(4, "0");
  const full = digits + tail;
  return `${full.slice(0, 4)}-${full.slice(4, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}`;
}

export function getPatientActName(
  firstName: string,
  lastName: string,
  middleName?: string
): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

/** Заказчик в акте: для ребёнка — родитель / законный представитель */
export function getWorkActCustomerName(patient: {
  firstName: string;
  lastName: string;
  middleName?: string;
  isChild?: boolean;
  representativeFullName?: string;
}): string {
  if (patient.isChild && patient.representativeFullName?.trim()) {
    return patient.representativeFullName.trim();
  }
  return getPatientActName(patient.firstName, patient.lastName, patient.middleName);
}

/** Сумма для печати: без символа ₽, с десятичными при необходимости */
export function formatActAmount(amount: number): string {
  const hasFraction = Math.abs(amount % 1) > 0.001;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: hasFraction ? 1 : 0,
  }).format(amount);
}

export function formatDocumentDiscount(
  discountType: DiscountType = "percent",
  discount = 0
): string {
  if (!discount) return "";
  return discountType === "percent" ? `${discount}%` : `${formatActAmount(discount)} руб.`;
}

export function buildWorkActMedicalRecommendations(act: {
  actNumber: string;
  actDate: string;
  totalAmount: number;
  notes?: string;
}): string {
  const base = `Акт № ${act.actNumber} от ${act.actDate}. Итого: ${act.totalAmount} ₽`;
  const note = act.notes?.trim();
  return note ? `${base} Примечание: ${note}` : base;
}

export function resolveWorkActTotals(act: WorkAct) {
  return calcWorkActAmounts(
    act.items,
    act.discountType ?? "rubles",
    act.discount ?? 0
  );
}
