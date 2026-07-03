import type { Invoice, WorkAct } from "@/lib/types";
import {
  formatDocumentDiscount,
  resolveWorkActTotals,
} from "@/lib/work-act-utils";

/** Текст счёта с привязкой к акту и скидке */
export function formatInvoiceDescription(act: WorkAct): string {
  const totals = resolveWorkActTotals(act);
  const discountLabel = formatDocumentDiscount(
    act.discountType ?? "percent",
    act.discount ?? 0
  );
  const base = `Счёт по акту ${act.actNumber} от ${act.actDate}`;
  if (totals.discountValue <= 0 && !discountLabel) return base;
  const parts = [base, `скидка ${discountLabel || formatCurrencyLike(totals.discountValue)}`];
  if (totals.discountValue > 0) {
    parts.push(`к оплате ${formatCurrencyLike(totals.totalAmount)}`);
  }
  return parts.join(", ");
}

function formatCurrencyLike(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

export function createInvoiceFromWorkAct(act: WorkAct, invoiceId: string): Invoice {
  const totals = resolveWorkActTotals(act);
  return {
    id: invoiceId,
    patientId: act.patientId,
    workActId: act.id,
    amount: totals.totalAmount,
    subtotalAmount: totals.afterRowDiscounts,
    discountType: act.discountType,
    discount: act.discount,
    discountValue: totals.discountValue,
    paid: 0,
    status: "pending",
    date: act.actDate,
    description: formatInvoiceDescription(act),
  };
}

/** Синхронизация счёта с актом (сумма, скидка, статус оплаты) */
export function patchInvoiceFromWorkAct(invoice: Invoice, act: WorkAct): Invoice {
  const totals = resolveWorkActTotals(act);
  const paid = Math.min(invoice.paid, totals.totalAmount);
  const status: Invoice["status"] =
    totals.totalAmount <= 0
      ? invoice.status
      : paid >= totals.totalAmount
        ? "paid"
        : paid > 0
          ? "partial"
          : "pending";
  return {
    ...invoice,
    patientId: act.patientId,
    workActId: act.id,
    amount: totals.totalAmount,
    subtotalAmount: totals.afterRowDiscounts,
    discountType: act.discountType,
    discount: act.discount,
    discountValue: totals.discountValue,
    paid,
    status,
    date: act.actDate,
    description: formatInvoiceDescription(act),
  };
}

export function findInvoiceForAct(
  invoices: Invoice[],
  act: WorkAct
): Invoice | undefined {
  if (act.invoiceId) {
    return invoices.find((i) => i.id === act.invoiceId);
  }
  return invoices.find((i) => i.workActId === act.id);
}

/** Суммы для отображения счёта (приоритет — данные акта) */
export function resolveInvoiceDisplay(inv: Invoice, act?: WorkAct) {
  const totals = act ? resolveWorkActTotals(act) : null;
  const total = totals?.totalAmount ?? inv.amount;
  const beforeDocDiscount =
    totals?.afterRowDiscounts ?? inv.subtotalAmount ?? total;
  const discountValue = totals?.discountValue ?? inv.discountValue ?? 0;
  return {
    total,
    beforeDocDiscount,
    discountValue,
    hasDiscount: discountValue > 0,
    actNumber: act?.actNumber,
  };
}
