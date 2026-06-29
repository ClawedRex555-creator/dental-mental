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
  if (act.paymentStatus === "paid") return true;
  return getWorkActPaidAmount(payments, act.id) >= act.totalAmount;
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
