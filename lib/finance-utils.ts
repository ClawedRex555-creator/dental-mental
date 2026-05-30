import type { Doctor, WorkAct } from "./types";

export interface PaymentSplit {
  total: number;
  doctorAmount: number;
  assistantAmount: number;
  clinicAmount: number;
  doctorPercent: number;
  assistantPercent: number;
}

export function calcPaymentSplit(
  total: number,
  doctor?: Doctor,
  assistant?: Doctor
): PaymentSplit {
  const doctorPercent = doctor?.role === "doctor" ? doctor.commissionPercent : 0;
  const assistantPercent = assistant?.role === "assistant" ? assistant.commissionPercent : 0;
  const doctorAmount = Math.round((total * doctorPercent) / 100);
  const assistantAmount = Math.round((total * assistantPercent) / 100);
  const clinicAmount = Math.max(0, total - doctorAmount - assistantAmount);
  return {
    total,
    doctorAmount,
    assistantAmount,
    clinicAmount,
    doctorPercent,
    assistantPercent,
  };
}

export function filterActsByPeriod(
  acts: WorkAct[],
  from: Date,
  to: Date
): WorkAct[] {
  return acts.filter((a) => {
    const d = new Date(a.actDate);
    return d >= from && d <= to;
  });
}
