import { format, subDays, startOfMonth, parseISO } from "date-fns";
import type {
  Appointment,
  DashboardKPI,
  Doctor,
  Payment,
  Patient,
  RevenueDataPoint,
  AppointmentsDataPoint,
  Service,
} from "./types";

export function computeDashboardKPI(
  payments: Payment[],
  appointments: Appointment[],
  patients: Patient[]
): DashboardKPI {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = startOfMonth(new Date());

  const paidToday = payments.filter(
    (p) => p.date === today && p.status === "paid"
  );
  const paidMonth = payments.filter(
    (p) => p.status === "paid" && parseISO(p.date) >= monthStart
  );

  const revenueToday = paidToday.reduce((s, p) => s + p.amount, 0);
  const revenueMonth = paidMonth.reduce((s, p) => s + p.amount, 0);
  const appointmentsToday = appointments.filter((a) => a.date === today).length;
  const newPatients = patients.filter((p) => p.status === "new").length;
  const patientDebts = patients
    .filter((p) => p.balance < 0)
    .reduce((s, p) => s + Math.abs(p.balance), 0);
  const completedPaid = appointments.filter(
    (a) => a.status === "completed" && a.paymentStatus === "paid"
  );
  const averageCheck =
    completedPaid.length > 0
      ? completedPaid.reduce((s, a) => s + a.price, 0) / completedPaid.length
      : 0;

  return {
    revenueToday,
    revenueMonth,
    appointmentsToday,
    newPatients,
    patientDebts,
    averageCheck,
    doctorLoad: 0,
    primaryConversion: 0,
  };
}

export function computeRevenueChart(payments: Payment[], days = 30): RevenueDataPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const date = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
    const revenue = payments
      .filter((p) => p.date === date && p.status === "paid")
      .reduce((s, p) => s + p.amount, 0);
    return { date: format(parseISO(date), "dd.MM"), revenue };
  });
}

export function computeAppointmentsChart(
  appointments: Appointment[],
  days = 14
): AppointmentsDataPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const date = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
    const count = appointments.filter((a) => a.date === date).length;
    return { date: format(parseISO(date), "dd.MM"), count };
  });
}

export function computeTopDoctors(
  doctors: Doctor[],
  appointments: Appointment[]
): { doctor: Doctor; revenue: number; appointments: number }[] {
  return doctors
    .filter((d) => d.role === "doctor")
    .map((doctor) => {
      const doctorAppointments = appointments.filter(
        (a) => a.doctorId === doctor.id && a.status === "completed"
      );
      return {
        doctor,
        revenue: doctorAppointments.reduce((s, a) => s + a.price, 0),
        appointments: doctorAppointments.length,
      };
    })
    .filter((item) => item.appointments > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export function computePopularServices(
  services: Service[],
  appointments: Appointment[]
): { service: Service; count: number; revenue: number }[] {
  const counts = new Map<string, { count: number; revenue: number }>();
  for (const apt of appointments.filter((a) => a.status === "completed")) {
    const key = apt.serviceId ?? apt.complaints ?? apt.reason ?? "other";
    const prev = counts.get(key) ?? { count: 0, revenue: 0 };
    counts.set(key, {
      count: prev.count + 1,
      revenue: prev.revenue + apt.price,
    });
  }

  return services
    .map((service) => {
      const stats = counts.get(service.id) ?? { count: 0, revenue: 0 };
      return { service, ...stats };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
