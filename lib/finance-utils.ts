import type { Appointment, Doctor, Payment, WorkAct } from "./types.ts";

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

export interface StaffSalariesSummary {
  doctorSalary: number;
  assistantSalary: number;
  totalSalaries: number;
  actsTurnover: number;
  clinicShareFromActs: number;
}

export function isDateInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

/** Зарплаты врачей (% от оплаченных актов) и ассистентов (почасово) за период */
export function computeStaffSalariesForRange(
  doctors: Doctor[],
  serviceActs: WorkAct[],
  appointments: Appointment[],
  from: Date,
  to: Date,
  manualAssistantHours: Record<string, string> = {}
): StaffSalariesSummary {
  const acts = serviceActs.filter(
    (a) => a.paymentStatus === "paid" && isDateInRange(a.actDate, from, to)
  );
  const apts = appointments.filter((a) => isDateInRange(a.date, from, to));

  let doctorSalary = 0;
  let actsTurnover = 0;
  let clinicShareFromActs = 0;

  for (const doctor of doctors.filter((d) => d.role === "doctor")) {
    const doctorActs = acts.filter((a) => a.doctorId === doctor.id);
    const total = doctorActs.reduce((s, a) => s + a.totalAmount, 0);
    actsTurnover += total;
    const split = calcPaymentSplit(total, doctor);
    doctorSalary += split.doctorAmount;
    clinicShareFromActs += split.clinicAmount;
  }

  let assistantSalary = 0;
  for (const assistant of doctors.filter((d) => d.role === "assistant")) {
    const assistantApts = apts.filter((a) => a.assistantId === assistant.id);
    const autoHours = assistantApts.reduce((s, a) => s + (a.assistantHours ?? 0), 0);
    const manual = manualAssistantHours[assistant.id];
    const hours =
      manual !== undefined && manual !== "" ? Number(manual) || 0 : autoHours;
    assistantSalary += Math.round(hours * (assistant.hourlyRate ?? 0));
  }

  return {
    doctorSalary,
    assistantSalary,
    totalSalaries: doctorSalary + assistantSalary,
    actsTurnover,
    clinicShareFromActs,
  };
}

export function sumPaidPaymentsInRange(
  payments: Payment[],
  from: Date,
  to: Date
): number {
  return payments
    .filter((p) => p.status === "paid" && isDateInRange(p.date, from, to))
    .reduce((s, p) => s + p.amount, 0);
}

/** Выручка минус все зарплаты за тот же период */
export function calcClinicNetAfterSalaries(
  revenue: number,
  salaries: StaffSalariesSummary
): number {
  return revenue - salaries.totalSalaries;
}
