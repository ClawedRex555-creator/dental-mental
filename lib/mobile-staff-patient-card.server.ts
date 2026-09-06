import "server-only";

import {
  APPOINTMENT_STATUS_LABELS,
  TREATMENT_PLAN_STATUS_LABELS,
} from "@/lib/constants";
import { findWorkActForAppointment, findWorkActForMedicalRecord } from "@/lib/visit-work-act";
import {
  formatWorkActItemsWithTeeth,
  formatWorkActItemWithTooth,
  formatWorkActTeethList,
} from "@/lib/work-act-utils";
import type {
  Appointment,
  AppointmentStatus,
  MedicalRecord,
  Patient,
  TreatmentPlan,
  TreatmentPlanStatus,
  WorkAct,
} from "@/lib/types";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { getWorkActPaidAmount, getWorkActRemainingAmount } from "@/lib/work-act-payment";

export interface MobileStaffVisitSummary {
  id: string;
  date: string;
  startTime?: string;
  status: string;
  statusLabel: string;
  doctorName: string;
  complaints?: string;
  actNumber?: string;
  actSummary?: string;
  isOtherClinicVisit?: boolean;
}

export interface MobileStaffMedicalRecordSummary {
  id: string;
  diagnosis: string;
  createdAt: string;
  doctorName: string;
  serviceName?: string;
  teethSummary?: string;
  servicesSummary?: string;
}

export interface MobileStaffFinanceActSummary {
  id: string;
  actNumber: string;
  actDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  submittedToAdmin?: boolean;
}

export interface MobileStaffPatientCard {
  visits: MobileStaffVisitSummary[];
  medicalRecords: MobileStaffMedicalRecordSummary[];
  finance: {
    balance: number;
    totalSpent: number;
    debtAmount: number;
    advanceAmount: number;
    acts: MobileStaffFinanceActSummary[];
  };
}

function doctorName(
  doctorId: string | undefined,
  doctors: { id: string; name: string }[]
): string {
  if (!doctorId) return "—";
  return doctors.find((d) => d.id === doctorId)?.name ?? "—";
}

function mapVisit(
  apt: Appointment,
  data: ClinicPersistedState
): MobileStaffVisitSummary {
  const records = data.medicalRecords ?? [];
  const workActs = data.workActs ?? [];
  const act = findWorkActForAppointment(apt, workActs, records);
  const status = apt.status as AppointmentStatus;
  const actItems = act?.items
    ?.slice(0, 3)
    .map((i) => formatWorkActItemWithTooth(i))
    .join(", ");

  return {
    id: apt.id,
    date: apt.date,
    startTime: apt.isOtherClinicVisit ? undefined : apt.startTime,
    status: apt.status,
    statusLabel: APPOINTMENT_STATUS_LABELS[status] ?? apt.status,
    doctorName: doctorName(apt.doctorId, data.doctors ?? []),
    complaints: apt.complaints ?? apt.reason,
    actNumber: act?.actNumber,
    actSummary: actItems,
    isOtherClinicVisit: apt.isOtherClinicVisit,
  };
}

export function buildMobileStaffPatientCard(
  patient: Patient,
  data: ClinicPersistedState
): MobileStaffPatientCard {
  const doctors = data.doctors ?? [];
  const payments = data.payments ?? [];
  const workActs = (data.workActs ?? []).filter((a) => a.patientId === patient.id);
  const records = (data.medicalRecords ?? [])
    .filter((r) => r.patientId === patient.id)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const visits = (data.appointments ?? [])
    .filter((a) => a.patientId === patient.id)
    .sort((a, b) => {
      if (a.isOtherClinicVisit && !b.isOtherClinicVisit) return 1;
      if (!a.isOtherClinicVisit && b.isOtherClinicVisit) return -1;
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return (b.startTime ?? "").localeCompare(a.startTime ?? "");
    })
    .slice(0, 30)
    .map((apt) => mapVisit(apt, data));

  const balance = patient.balance ?? 0;
  const debtAmount = balance < 0 ? -balance : 0;
  const advanceAmount = balance > 0 ? balance : 0;

  const acts: MobileStaffFinanceActSummary[] = workActs
    .sort((a, b) => b.actDate.localeCompare(a.actDate) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((act) => ({
      id: act.id,
      actNumber: act.actNumber,
      actDate: act.actDate,
      totalAmount: act.totalAmount,
      paidAmount: getWorkActPaidAmount(payments, act.id),
      remainingAmount: getWorkActRemainingAmount(act, payments),
      paymentStatus: act.paymentStatus,
      submittedToAdmin: act.submittedToAdmin,
    }));

  return {
    visits,
    medicalRecords: records.slice(0, 15).map((r: MedicalRecord) => {
      const act = findWorkActForMedicalRecord(r, workActs);
      return {
        id: r.id,
        diagnosis: r.diagnosis,
        createdAt: r.createdAt,
        doctorName: doctorName(r.doctorId, doctors),
        serviceName: r.serviceName,
        teethSummary: act ? formatWorkActTeethList(act.items) ?? undefined : undefined,
        servicesSummary: act
          ? formatWorkActItemsWithTeeth(act.items, 4) || undefined
          : undefined,
      };
    }),
    finance: {
      balance,
      totalSpent: patient.totalSpent ?? 0,
      debtAmount,
      advanceAmount,
      acts,
    },
  };
}

export function treatmentPlanStatusLabel(status: string): string {
  return (
    TREATMENT_PLAN_STATUS_LABELS[status as TreatmentPlanStatus] ??
    status
  );
}

export function mapTreatmentPlanForMobile(
  plan: TreatmentPlan,
  patients: Patient[],
  doctors: { id: string; name: string }[]
) {
  const patient = patients.find((p) => p.id === plan.patientId);
  const doctor = doctors.find((d) => d.id === plan.doctorId);
  const patientName = patient
    ? [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ")
    : "—";
  return {
    id: plan.id,
    patientId: plan.patientId,
    patientName,
    doctorId: plan.doctorId,
    doctorName: doctor?.name ?? "—",
    title: plan.title,
    status: plan.status,
    statusLabel: treatmentPlanStatusLabel(plan.status),
    finalAmount: plan.finalAmount,
    itemsCount: plan.items.length,
    createdAt: plan.createdAt,
    summaryLine: `${treatmentPlanStatusLabel(plan.status)} · ${plan.items.length} поз. · ${plan.finalAmount.toLocaleString("ru-RU")} ₽`,
  };
}
