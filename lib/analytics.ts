import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import { isDateInRange } from "@/lib/salary-period";
import {
  filterPaymentsWithExistingWorkActs,
  getPaymentReportingDate,
} from "@/lib/work-act-payment";
import type {
  Appointment,
  AppointmentsDataPoint,
  DashboardKPI,
  Doctor,
  Payment,
  Patient,
  RevenueDataPoint,
  Service,
  WorkAct,
} from "./types";

export type AnalyticsPeriod = "day" | "week" | "month" | "custom";

export interface AnalyticsPeriodRange {
  from: Date;
  to: Date;
}

export interface PopularServiceStat {
  id: string;
  name: string;
  count: number;
  revenue: number;
}

export interface DoctorRevenueStat {
  doctor: Doctor;
  revenue: number;
  appointments: number;
  acts: number;
}

const EXCLUDED_APPOINTMENT_STATUSES = new Set<Appointment["status"]>([
  "cancelled",
  "no_show",
]);

function isCountableAppointment(appointment: Appointment): boolean {
  return (
    !appointment.isOtherClinicVisit &&
    !EXCLUDED_APPOINTMENT_STATUSES.has(appointment.status)
  );
}

function linkedPaidPayments(payments: Payment[], workActs: WorkAct[]): Payment[] {
  return filterPaymentsWithExistingWorkActs(payments, workActs).filter(
    (payment) => payment.status === "paid"
  );
}

function paidServiceActs(workActs: WorkAct[]): WorkAct[] {
  return workActs.filter(
    (act) => act.actType !== "prepayment" && act.paymentStatus === "paid"
  );
}

export function sumRevenueInRange(
  payments: Payment[],
  workActs: WorkAct[],
  from: Date,
  to: Date
): number {
  return linkedPaidPayments(payments, workActs)
    .filter((payment) =>
      isDateInRange(getPaymentReportingDate(payment, workActs), from, to)
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function computeDashboardKPI(
  payments: Payment[],
  appointments: Appointment[],
  patients: Patient[],
  workActs: WorkAct[],
  doctors: Doctor[] = []
): DashboardKPI {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const revenueToday = sumRevenueInRange(
    payments,
    workActs,
    startOfDay(new Date()),
    endOfDay(new Date())
  );
  const revenueMonth = sumRevenueInRange(payments, workActs, monthStart, monthEnd);

  const appointmentsToday = appointments.filter(
    (appointment) => appointment.date === today && isCountableAppointment(appointment)
  ).length;

  const newPatients = patients.filter((patient) =>
    isDateInRange(patient.createdAt, monthStart, monthEnd)
  ).length;

  const patientDebts = patients
    .filter((patient) => patient.balance < 0)
    .reduce((sum, patient) => sum + Math.abs(patient.balance), 0);

  const paidActsInMonth = paidServiceActs(workActs).filter((act) =>
    isDateInRange(act.actDate, monthStart, monthEnd)
  );
  const averageCheck =
    paidActsInMonth.length > 0
      ? paidActsInMonth.reduce((sum, act) => sum + act.totalAmount, 0) /
        paidActsInMonth.length
      : 0;

  const doctorCount = doctors.filter((doctor) => doctor.role === "doctor").length;
  const doctorLoad =
    doctorCount > 0 ? Math.round((appointmentsToday / doctorCount) * 10) / 10 : 0;

  const monthAppointments = appointments.filter(
    (appointment) =>
      isDateInRange(appointment.date, monthStart, monthEnd) &&
      !appointment.isOtherClinicVisit
  );
  const scheduledMonth = monthAppointments.filter(
    (appointment) => !EXCLUDED_APPOINTMENT_STATUSES.has(appointment.status)
  ).length;
  const completedMonth = monthAppointments.filter(
    (appointment) => appointment.status === "completed"
  ).length;
  const primaryConversion =
    scheduledMonth > 0 ? Math.round((completedMonth / scheduledMonth) * 100) : 0;

  return {
    revenueToday,
    revenueMonth,
    appointmentsToday,
    newPatients,
    patientDebts,
    averageCheck,
    doctorLoad,
    primaryConversion,
  };
}

export function computeRevenueChart(
  payments: Payment[],
  workActs: WorkAct[],
  days = 30
): RevenueDataPoint[] {
  const to = endOfDay(new Date());
  const from = startOfDay(subDays(to, days - 1));

  return eachDayOfInterval({ start: from, end: to }).map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const revenue = linkedPaidPayments(payments, workActs)
      .filter(
        (payment) => getPaymentReportingDate(payment, workActs) === dateKey
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
    return { date: format(day, "dd.MM"), revenue };
  });
}

export function computeRevenueChartForRange(
  payments: Payment[],
  workActs: WorkAct[],
  from: Date,
  to: Date
): RevenueDataPoint[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (start > end) return [];

  return eachDayOfInterval({ start, end }).map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const revenue = linkedPaidPayments(payments, workActs)
      .filter(
        (payment) => getPaymentReportingDate(payment, workActs) === dateKey
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
    return { date: format(day, "dd.MM"), revenue };
  });
}

export function computeAppointmentsChart(
  appointments: Appointment[],
  days = 14
): AppointmentsDataPoint[] {
  const to = endOfDay(new Date());
  const from = startOfDay(subDays(to, days - 1));

  return eachDayOfInterval({ start: from, end: to }).map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const count = appointments.filter(
      (appointment) =>
        appointment.date === dateKey && isCountableAppointment(appointment)
    ).length;
    return { date: format(day, "dd.MM"), count };
  });
}

export function computeAppointmentsChartForRange(
  appointments: Appointment[],
  from: Date,
  to: Date
): AppointmentsDataPoint[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (start > end) return [];

  return eachDayOfInterval({ start, end }).map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const count = appointments.filter(
      (appointment) =>
        appointment.date === dateKey && isCountableAppointment(appointment)
    ).length;
    return { date: format(day, "dd.MM"), count };
  });
}

export function computeTopDoctors(
  doctors: Doctor[],
  workActs: WorkAct[],
  appointments: Appointment[],
  from?: Date,
  to?: Date
): DoctorRevenueStat[] {
  const acts = paidServiceActs(workActs).filter((act) =>
    from && to ? isDateInRange(act.actDate, from, to) : true
  );

  return doctors
    .filter((doctor) => doctor.role === "doctor")
    .map((doctor) => {
      const doctorActs = acts.filter((act) => act.doctorId === doctor.id);
      const doctorAppointments = appointments.filter((appointment) => {
        if (appointment.doctorId !== doctor.id || !isCountableAppointment(appointment)) {
          return false;
        }
        return from && to
          ? isDateInRange(appointment.date, from, to)
          : true;
      });
      return {
        doctor,
        revenue: doctorActs.reduce((sum, act) => sum + act.totalAmount, 0),
        appointments: doctorAppointments.length,
        acts: doctorActs.length,
      };
    })
    .filter((item) => item.revenue > 0 || item.appointments > 0)
    .sort((a, b) => b.revenue - a.revenue || b.appointments - a.appointments)
    .slice(0, 5);
}

export function computePopularServices(
  services: Service[],
  workActs: WorkAct[],
  from?: Date,
  to?: Date
): PopularServiceStat[] {
  const counts = new Map<string, PopularServiceStat>();
  const acts = paidServiceActs(workActs).filter((act) =>
    from && to ? isDateInRange(act.actDate, from, to) : true
  );

  for (const act of acts) {
    for (const item of act.items) {
      const serviceId = item.serviceId ?? `custom:${item.serviceName}`;
      const serviceName =
        item.serviceId != null
          ? services.find((service) => service.id === item.serviceId)?.name ??
            item.serviceName
          : item.serviceName;
      const prev = counts.get(serviceId) ?? {
        id: serviceId,
        name: serviceName,
        count: 0,
        revenue: 0,
      };
      counts.set(serviceId, {
        ...prev,
        name: serviceName,
        count: prev.count + Math.max(1, item.quantity || 1),
        revenue: prev.revenue + item.total,
      });
    }
  }

  return [...counts.values()]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 6);
}

export function countAppointmentsInRange(
  appointments: Appointment[],
  from: Date,
  to: Date
): number {
  return appointments.filter(
    (appointment) =>
      isDateInRange(appointment.date, from, to) &&
      isCountableAppointment(appointment)
  ).length;
}

export function countNewPatientsInRange(
  patients: Patient[],
  from: Date,
  to: Date
): number {
  return patients.filter((patient) => isDateInRange(patient.createdAt, from, to))
    .length;
}

export function computeAverageCheckInRange(
  workActs: WorkAct[],
  from: Date,
  to: Date
): number {
  const acts = paidServiceActs(workActs).filter((act) =>
    isDateInRange(act.actDate, from, to)
  );
  if (acts.length === 0) return 0;
  return acts.reduce((sum, act) => sum + act.totalAmount, 0) / acts.length;
}

export function formatAnalyticsPeriodLabel(from: Date, to: Date): string {
  return `${format(from, "d.MM.yyyy")} — ${format(to, "d.MM.yyyy")}`;
}
