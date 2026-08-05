import "server-only";

import {
  buildDoctorSalarySummary,
  getPaidServiceActsForDoctor,
  resolveDoctorStaffId,
} from "@/lib/doctor-salary";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import {
  mapAppointmentToMobile,
  type MobileStaffAppointment,
} from "@/lib/mobile-staff-map";
import { canViewAllStaffAppointments } from "@/lib/mobile-staff-auth.server";
import type {
  Appointment,
  Doctor,
  DoctorMonthSchedule,
} from "@/lib/types";

export interface MobileStaffDoctorProfile {
  id: string;
  userId: string;
  clinicId: string;
  fullName: string;
  specialization: string;
  photoUrl?: string;
  isActive: boolean;
  commissionPercent: number;
}

export interface MobileStaffEarnings {
  today: number;
  week: number;
  month: number;
  period?: {
    from: string;
    to: string;
    doctorAmount: number;
    actsCount: number;
    patientsTotal: number;
    doctorPercent: number;
    lines: Array<{
      actId: string;
      actDate: string;
      actNumber: string;
      patientName: string;
      total: number;
      doctorAmount: number;
    }>;
  };
}

export function mapDoctorToMobileProfile(
  doctor: Doctor,
  clinicId: string,
  accountUserId: string
): MobileStaffDoctorProfile {
  return {
    id: doctor.id,
    userId: accountUserId,
    clinicId,
    fullName: doctor.name,
    specialization: doctor.specialization,
    photoUrl: doctor.avatar,
    isActive: doctor.status === "active",
    commissionPercent: doctor.commissionPercent,
  };
}

function parseDateRange(
  fromParam: string | null,
  toParam: string | null
): { from: string; to: string } | null {
  const from = fromParam?.trim();
  const to = toParam?.trim();
  if (!from || !to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  return { from, to };
}

function appointmentInRange(appointment: Appointment, from: string, to: string): boolean {
  return appointment.date >= from && appointment.date <= to;
}

export async function getMobileStaffProfile(
  clinicId: string,
  session: MobileTokenPayload,
  _clinicName: string
): Promise<MobileStaffDoctorProfile | null> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return null;

  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  if (!doctorId) return null;

  const doctor = data.doctors.find((d) => d.id === doctorId);
  if (!doctor) return null;

  return mapDoctorToMobileProfile(doctor, clinicId, session.userId);
}

export async function getMobileStaffAppointments(
  clinicId: string,
  clinicName: string,
  session: MobileTokenPayload,
  options: { from?: string | null; to?: string | null; doctorId?: string | null }
): Promise<MobileStaffAppointment[]> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return [];

  const range = parseDateRange(options.from ?? null, options.to ?? null);
  const resolvedDoctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);

  let filterDoctorId: string | undefined;
  if (canViewAllStaffAppointments(session.role)) {
    const requested = options.doctorId?.trim();
    filterDoctorId = requested || undefined;
  } else {
    filterDoctorId = resolvedDoctorId;
    if (!filterDoctorId) return [];
  }

  let appointments = data.appointments.filter((a) => !a.isOtherClinicVisit);
  // Mobile schedule grid: hide cancelled / no-show by default
  appointments = appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show"
  );
  if (filterDoctorId) {
    appointments = appointments.filter((a) => a.doctorId === filterDoctorId);
  }
  if (range) {
    appointments = appointments.filter((a) =>
      appointmentInRange(a, range.from, range.to)
    );
  }

  appointments.sort((a, b) => {
    const aKey = `${a.date}T${a.startTime}`;
    const bKey = `${b.date}T${b.startTime}`;
    return aKey.localeCompare(bKey);
  });

  return appointments.map((a) =>
    mapAppointmentToMobile(a, data.patients, data.doctors, clinicId, clinicName)
  );
}

export async function getMobileStaffSchedule(
  clinicId: string,
  session: MobileTokenPayload,
  month: string
): Promise<DoctorMonthSchedule | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Укажите месяц в формате YYYY-MM");
  }

  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return null;

  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  if (!doctorId) return null;

  return (
    (data.doctorSchedules ?? []).find(
      (s) => s.doctorId === doctorId && s.month === month
    ) ?? {
      doctorId,
      month,
      days: {},
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function getMobileStaffEarnings(
  clinicId: string,
  session: MobileTokenPayload,
  options: { from?: string | null; to?: string | null }
): Promise<MobileStaffEarnings | null> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return null;

  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  if (!doctorId) return null;

  const doctor = data.doctors.find((d) => d.id === doctorId);
  if (!doctor) return null;

  const now = new Date();
  const dayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayTo = new Date(dayFrom);
  dayTo.setHours(23, 59, 59, 999);

  const weekStart = new Date(dayFrom);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const acts = data.workActs ?? [];
  const services = data.services ?? [];
  const payments = data.payments ?? [];

  const sumRange = (from: Date, to: Date) =>
    buildDoctorSalarySummary(
      doctor,
      getPaidServiceActsForDoctor(acts, doctorId, from, to, payments),
      data.patients,
      services
    ).doctorAmount;

  const result: MobileStaffEarnings = {
    today: sumRange(dayFrom, dayTo),
    week: sumRange(weekStart, weekEnd),
    month: sumRange(monthStart, monthEnd),
  };

  const range = parseDateRange(options.from ?? null, options.to ?? null);
  if (range) {
    const from = new Date(range.from);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    const summary = buildDoctorSalarySummary(
      doctor,
      getPaidServiceActsForDoctor(acts, doctorId, from, to, payments),
      data.patients,
      services
    );
    result.period = {
      from: range.from,
      to: range.to,
      doctorAmount: summary.doctorAmount,
      actsCount: summary.actsCount,
      patientsTotal: summary.patientsTotal,
      doctorPercent: summary.doctorPercent,
      lines: summary.lines.map((line) => ({
        actId: line.act.id,
        actDate: line.act.actDate,
        actNumber: line.act.actNumber,
        patientName: line.patientName,
        total: line.total,
        doctorAmount: line.doctorAmount,
      })),
    };
  }

  return result;
}
