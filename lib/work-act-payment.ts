import type { Payment, WorkAct } from "./types";

export function getWorkActPaidAmount(
  payments: Payment[],
  actId: string
): number {
  return payments
    .filter((p) => p.workActId === actId && p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
}

export function getWorkActRemainingAmount(
  act: WorkAct,
  payments: Payment[]
): number {
  const paid = getWorkActPaidAmount(payments, act.id);
  return Math.max(0, act.totalAmount - paid);
}

export function isWorkActFullyPaid(act: WorkAct, payments: Payment[]): boolean {
  if (act.totalAmount <= 0) return act.paymentStatus === "paid";
  return getWorkActPaidAmount(payments, act.id) >= act.totalAmount;
}

/** Нулевой акт можно закрыть без внесения денег */
export function canCloseZeroWorkAct(act: WorkAct, payments: Payment[]): boolean {
  return act.totalAmount <= 0 && !isWorkActFullyPaid(act, payments);
}

/**
 * Дата начисления ЗП: день полной оплаты (последний платёж).
 * Для нулевого акта — дата акта (закрытие без платежа).
 */
export function getWorkActSalaryAccrualDate(
  act: WorkAct,
  payments: Payment[]
): string | null {
  if (act.actType === "prepayment") return null;
  if (!isWorkActFullyPaid(act, payments)) return null;
  if (act.totalAmount <= 0) return act.actDate;
  const dates = payments
    .filter((p) => p.workActId === act.id && p.status === "paid")
    .map((p) => p.date)
    .sort();
  return dates[dates.length - 1] ?? act.actDate;
}

export function resolvePatientBalanceAfterActPayment(
  previousBalance: number,
  actTotal: number,
  alreadyPaid: number,
  payAmount: number
): number {
  const shouldApplyActDebt = alreadyPaid <= 0;
  return previousBalance + payAmount - (shouldApplyActDebt ? actTotal : 0);
}

/** Дата для отчётов: у платежа по акту — дата акта, иначе дата платежа. */
export function getPaymentReportingDate(
  payment: Payment,
  workActs: WorkAct[]
): string {
  if (!payment.workActId) return payment.date;
  const act = workActs.find((a) => a.id === payment.workActId);
  return act?.actDate ?? payment.date;
}

/** Платежи без существующего акта (после удаления акта или сбоя sync). */
export function filterPaymentsWithExistingWorkActs(
  payments: Payment[],
  workActs: WorkAct[]
): Payment[] {
  const actIds = new Set(workActs.map((a) => a.id));
  return payments.filter((p) => !p.workActId || actIds.has(p.workActId));
}
