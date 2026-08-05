import {
  isImplantationServiceCategory,
  resolveCommissionServiceCategory,
} from "@/lib/service-categories";
import {
  calcWorkActAmounts,
  calcWorkActLine,
  calcWorkActItemTechnicalAmount,
  calcWorkActTechnicalAmount,
} from "@/lib/work-act-utils";
import { getWorkActSalaryAccrualDate } from "@/lib/work-act-payment";
import {
  type AssistantManualHoursMap,
  calcAssistantHoursInRange,
  normalizeAssistantManualHours,
} from "./assistant-hours";
import type {
  Appointment,
  ClinicExpense,
  DiscountBearer,
  Doctor,
  Payment,
  Service,
  WorkAct,
  WorkActItem,
} from "./types";

export interface PaymentSplit {
  total: number;
  technicalAmount: number;
  doctorAmount: number;
  assistantAmount: number;
  clinicAmount: number;
  doctorPercent: number;
  assistantPercent: number;
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

function calcDoctorAmountOnRevenueBase(
  act: WorkAct,
  doctor: Doctor,
  services: Service[],
  revenueBase: number
): number {
  if (revenueBase <= 0) return 0;
  let doctorAmount = 0;
  for (const item of act.items) {
    const category = resolveCommissionServiceCategory(item, services);
    const line = calcWorkActLine(item);
    const lineRevenue = Math.max(0, line.totalAfterDiscount - calcWorkActItemTechnicalAmount(item));
    doctorAmount += doctorLineAmount(item, lineRevenue, category, doctor);
  }
  return Math.min(doctorAmount, revenueBase);
}

function applyActDiscountBearer(
  doctorAmountFull: number,
  afterRowDiscounts: number,
  discountValue: number,
  totalAmount: number,
  bearer: DiscountBearer | undefined
): { doctorAmount: number; clinicAmount: number } {
  const doctorFull = Math.min(Math.max(0, doctorAmountFull), Math.max(0, afterRowDiscounts));
  const clinicFull = Math.max(0, afterRowDiscounts - doctorFull);

  if (discountValue <= 0 || afterRowDiscounts <= 0) {
    const doctorAmount = Math.min(doctorFull, Math.max(0, totalAmount));
    return { doctorAmount, clinicAmount: totalAmount - doctorAmount };
  }

  if (bearer === "clinic") {
    // Скидка клиники: ЗП врача как без доп. скидки (вплоть до 100%).
    // Клиника покрывает скидку — доля клиники может стать отрицательной.
    const doctorAmount = doctorFull;
    return { doctorAmount, clinicAmount: totalAmount - doctorAmount };
  }

  if (bearer === "doctor") {
    // Скидка врача: прибыль клиники как без доп. скидки.
    // Врач покрывает скидку; если скидка больше доли врача — остаток гасится из оплаты.
    const clinicAmount = clinicFull;
    const doctorAmount = totalAmount - clinicAmount;
    if (doctorAmount < 0) {
      return { doctorAmount: 0, clinicAmount: totalAmount };
    }
    return { doctorAmount, clinicAmount };
  }

  // Общая скидка: пропорционально долям врача и клиники
  const ratio = doctorFull / afterRowDiscounts;
  const doctorDiscountShare = Math.round(discountValue * ratio);
  const doctorAmount = Math.max(0, doctorFull - doctorDiscountShare);
  return { doctorAmount, clinicAmount: totalAmount - doctorAmount };
}

/** Начисление врачу по акту с учётом категории «Имплантация» и источника скидки */
export function calcDoctorPaymentForAct(
  act: WorkAct,
  doctor?: Doctor,
  services: Service[] = []
): PaymentSplit {
  const total = Math.max(0, act.totalAmount);
  const technicalAmount = Math.min(total, calcWorkActTechnicalAmount(act.items));
  if (!doctor || doctor.role !== "doctor") {
    return {
      total,
      technicalAmount,
      doctorAmount: 0,
      assistantAmount: 0,
      clinicAmount: total - technicalAmount,
      doctorPercent: 0,
      assistantPercent: 0,
    };
  }

  const { totalAmount, afterRowDiscounts, discountValue } = calcWorkActAmounts(
    act.items,
    act.discountType ?? "rubles",
    act.discount ?? 0
  );
  const technicalBase = calcWorkActTechnicalAmount(act.items);
  const splitTechnical = Math.min(Math.max(0, totalAmount), technicalBase);
  const revenueBaseAfterTechnical = Math.max(0, afterRowDiscounts - technicalBase);
  const splitTotal = Math.max(0, totalAmount - splitTechnical);

  const doctorAmountFull = calcDoctorAmountOnRevenueBase(
    act,
    doctor,
    services,
    revenueBaseAfterTechnical
  );
  const { doctorAmount, clinicAmount } = applyActDiscountBearer(
    doctorAmountFull,
    revenueBaseAfterTechnical,
    discountValue,
    splitTotal,
    act.discountBearer
  );

  return {
    total,
    technicalAmount: splitTechnical,
    doctorAmount,
    assistantAmount: 0,
    clinicAmount,
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
      const assistantBase = Math.max(0, total - fromAct.technicalAmount);
      const assistantAmount = Math.round((assistantBase * assistantPercent) / 100);
      return {
        ...fromAct,
        assistantAmount,
        assistantPercent,
        clinicAmount: Math.max(
          0,
          total - fromAct.technicalAmount - fromAct.doctorAmount - assistantAmount
        ),
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
    technicalAmount: 0,
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
  technicalCosts: number;
  actsTurnover: number;
  clinicShareFromActs: number;
}

export const EMPTY_STAFF_SALARIES: StaffSalariesSummary = {
  doctorSalary: 0,
  assistantSalary: 0,
  totalSalaries: 0,
  technicalCosts: 0,
  actsTurnover: 0,
  clinicShareFromActs: 0,
};

export function isDateInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

/** Зарплаты врачей (% от полностью оплаченных актов) и ассистентов (почасово) за период.
 *  ЗП врача начисляется по дате полной оплаты (не по дате акта). */
export function computeStaffSalariesForRange(
  doctors: Doctor[],
  serviceActs: WorkAct[],
  appointments: Appointment[],
  from: Date,
  to: Date,
  manualAssistantHours: AssistantManualHoursMap | Record<string, string> = {},
  services: Service[] = [],
  payments: Payment[] = []
): StaffSalariesSummary {
  const manualByDay = normalizeAssistantManualHours(manualAssistantHours);
  const acts = serviceActs.filter((a) => {
    const accrual = getWorkActSalaryAccrualDate(a, payments);
    return accrual != null && isDateInRange(accrual, from, to);
  });
  const apts = appointments.filter((a) => isDateInRange(a.date, from, to));

  let doctorSalary = 0;
  let actsTurnover = 0;
  let clinicShareFromActs = 0;
  const technicalCosts = acts.reduce(
    (sum, act) =>
      sum + Math.min(Math.max(0, act.totalAmount), calcWorkActTechnicalAmount(act.items)),
    0
  );

  for (const doctor of doctors.filter((d) => d.role === "doctor")) {
    const doctorActs = acts.filter((a) => a.doctorId === doctor.id);
    const total = doctorActs.reduce((s, a) => s + a.totalAmount, 0);
    actsTurnover += total;
    let doctorAmount = 0;
    let clinicAmount = 0;
    for (const a of doctorActs) {
      const split = calcDoctorPaymentForAct(a, doctor, services);
      doctorAmount += split.doctorAmount;
      clinicAmount += split.clinicAmount;
    }
    doctorSalary += doctorAmount;
    clinicShareFromActs += clinicAmount;
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
    technicalCosts,
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
  return revenue - salaries.totalSalaries - salaries.technicalCosts;
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
  return revenue - salaries.totalSalaries - salaries.technicalCosts - expensesTotal;
}
