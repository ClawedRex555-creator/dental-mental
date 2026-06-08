import type { PatientStatus } from "./types";

/** Сумма долга (положительное число) из баланса: отрицательный баланс = долг. */
export function getPatientDebtAmount(balance: number): number {
  if (!Number.isFinite(balance) || balance >= 0) return 0;
  return Math.abs(balance);
}

export function parseDebtInput(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".").trim();
  if (!normalized) return 0;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** Баланс и статус после сохранения с учётом долга и предоплаты (положительный баланс). */
export function resolveBalanceFromDebt(
  status: PatientStatus,
  debtAmountRub: number,
  previousBalance: number
): { balance: number; status: PatientStatus } {
  const credit = Math.max(0, previousBalance);
  if (status !== "debtor") {
    return { balance: previousBalance, status };
  }

  const debt = Math.max(0, debtAmountRub);
  if (debt <= 0) {
    return { balance: credit, status: "active" };
  }

  const balance = credit - debt;
  return {
    balance,
    status: balance < 0 ? "debtor" : "active",
  };
}
