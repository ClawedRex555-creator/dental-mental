import {
  isImplantationServiceCategory,
  resolveCommissionServiceCategory,
} from "@/lib/service-categories";
import { calcWorkActAmounts, calcWorkActLine } from "@/lib/work-act-utils";
import {
  type AssistantManualHoursMap,
  calcAssistantHoursInRange,
  normalizeAssistantManualHours,
} from "./assistant-hours";
import type { Appointment, ClinicExpense, Doctor, Payment, Service, WorkAct, WorkActItem } from "./types";

export interface PaymentSplit {
  total: number;
  doctorAmount: number;
  assistantAmount: number;
  clinicAmount: number;
  doctorPercent: number;
  assistantPercent: number;
}

function lineRevenueInAct(
  act: WorkAct,
  item: WorkActItem,
  actTotal: number,
  afterRowDiscounts: number
): number {
  const line = calcWorkActLine(item);
  if (afterRowDiscounts <= 0 || actTotal <= 0) return 0;
  return (actTotal * line.totalAfterDiscount) / afterRowDiscounts;
}

function doctorLineAmount(
  item: WorkActItem,
  lineRevenue: number,
  category: string,
  doctor: Doctor
): number {
  const qty = Math.max(1, item.quantity || 1);

  if (isImplantationServiceCategory(category) && doctor.implantFee != null && doctor.implantFee > 0) {
    if (doctor.implantFeeType === "rubles") {
      return Math.round(doctor.implantFee * qty);
    }
    return Math.round((lineRevenue * doctor.implantFee) / 100);
  }

  const pct = doctor.commissionPercent;
  return Math.round((lineRevenue * pct) / 100);
}

/** Начисление врачу по акту с учётом категории «Имплантация» */
export function calcDoctorPaymentForAct(
  act: WorkAct,
  doctor?: Doctor,
  services: Service[] = []
): PaymentSplit {
  const total = act.totalAmount;
  if (!doctor || doctor.role !== "doctor") {
    return {
      total,
      doctorAmount: 0,
      assistantAmount: 0,
      clinicAmount: total,
      doctorPercent: 0,
      assistantPercent: 0,
    };
  }

  const { totalAmount, afterRowDiscounts } = calcWorkActAmounts(
    act.items,
    act.discountType ?? "rubles",
    act.discount ?? 0
  );

  let doctorAmount = 0;
  for (const item of act.items) {
    const category = resolveCommissionServiceCategory(item, services);
    const lineRevenue = lineRevenueInAct(act, item, totalAmount, afterRowDiscounts);
    doctorAmount += doctorLineAmount(item, lineRevenue, category, doctor);
  }

  doctorAmount = Math.min(doctorAmount, totalAmount);

  return {
    total,
    doctorAmount,
    assistantAmount: 0,
    clinicAmount: Math.max(0, total - doctorAmount),
    doctorPercent: doctor.commissionPercent,
    assistantPercent: 0,
  };
}

export function calcPaymentSplit(
  total: number,
  doctor?: Doctor,
  assistant?: Doctor,
  act?: WorkAct,
  services: Service[] = []
): PaymentSplit {
  if (act && doctor?.role === "doctor") {
    const fromAct = calcDoctorPaymentForAct(act, doctor, services);
    if (assistant?.role === "assistant") {
      const assistantPercent = assistant.commissionPercent;
      const assistantAmount = Math.round((total * assistantPercent) / 100);
      return {
        ...fromAct,
        assistantAmount,
        assistantPercent,
        clinicAmount: Math.max(0, total - fromAct.doctorAmount - assistantAmount),
      };
    }
    return fromAct;
  }

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
  manualAssistantHours: AssistantManualHoursMap | Record<string, string> = {},
  services: Service[] = []
): StaffSalariesSummary {
  const manualByDay = normalizeAssistantManualHours(manualAssistantHours);
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
    const doctorAmount = doctorActs.reduce(
      (s, a) => s + calcDoctorPaymentForAct(a, doctor, services).doctorAmount,
      0
    );
    doctorSalary += doctorAmount;
    clinicShareFromActs += Math.max(0, total - doctorAmount);
  }

  let assistantSalary = 0;
  for (const assistant of doctors.filter((d) => d.role === "assistant")) {
    const hours = calcAssistantHoursInRange(
      assistant.id,
      apts,
      from,
      to,
      manualByDay
    );
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

export function sumClinicExpensesInRange(
  expenses: ClinicExpense[],
  from: Date,
  to: Date
): number {
  return expenses
    .filter((e) => isDateInRange(e.date, from, to))
    .reduce((s, e) => s + e.amount, 0);
}

export function sumStaffPaidExpensesInRange(
  expenses: ClinicExpense[],
  from: Date,
  to: Date
): number {
  return expenses
    .filter((e) => e.paidByStaffId && isDateInRange(e.date, from, to))
    .reduce((s, e) => s + e.amount, 0);
}

/** Выручка минус зарплаты и расходы клиники */
export function calcClinicNetAfterSalariesAndExpenses(
  revenue: number,
  salaries: StaffSalariesSummary,
  expensesTotal: number
): number {
  return revenue - salaries.totalSalaries - expensesTotal;
}
