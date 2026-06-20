import { calcDoctorPaymentForAct } from "@/lib/finance-utils";
import { isDateInRange } from "@/lib/salary-period";
import type { Doctor, Patient, Service, WorkAct } from "@/lib/types";

export interface DoctorSalaryLine {
  act: WorkAct;
  patientName: string;
  doctorAmount: number;
  total: number;
}

export interface DoctorSalarySummary {
  doctor: Doctor;
  actsCount: number;
  patientsTotal: number;
  doctorAmount: number;
  clinicAmount: number;
  doctorPercent: number;
  lines: DoctorSalaryLine[];
}

export function resolveDoctorStaffId(
  staffId: string | undefined,
  email: string,
  doctors: Doctor[]
): string | undefined {
  if (staffId) return staffId;
  const match = doctors.find(
    (d) =>
      d.role === "doctor" &&
      d.email.trim().toLowerCase() === email.trim().toLowerCase()
  );
  return match?.id;
}

export function getPaidServiceActsForDoctor(
  workActs: WorkAct[],
  doctorId: string,
  from: Date,
  to: Date
): WorkAct[] {
  return workActs
    .filter(
      (a) =>
        a.actType !== "prepayment" &&
        a.paymentStatus === "paid" &&
        a.doctorId === doctorId &&
        isDateInRange(a.actDate, from, to)
    )
    .sort((a, b) => b.actDate.localeCompare(a.actDate));
}

export function buildDoctorSalarySummary(
  doctor: Doctor,
  acts: WorkAct[],
  patients: Patient[],
  services: Service[] = []
): DoctorSalarySummary {
  const patientsTotal = acts.reduce((s, a) => s + a.totalAmount, 0);
  const doctorAmount = acts.reduce(
    (s, a) => s + calcDoctorPaymentForAct(a, doctor, services).doctorAmount,
    0
  );
  const clinicAmount = Math.max(0, patientsTotal - doctorAmount);

  const lines: DoctorSalaryLine[] = acts.map((act) => {
    const patient = patients.find((p) => p.id === act.patientId);
    const patientName = patient
      ? [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ")
      : "—";
    const lineSplit = calcDoctorPaymentForAct(act, doctor, services);
    return {
      act,
      patientName,
      doctorAmount: lineSplit.doctorAmount,
      total: act.totalAmount,
    };
  });

  return {
    doctor,
    actsCount: acts.length,
    patientsTotal,
    doctorAmount,
    clinicAmount,
    doctorPercent: doctor.commissionPercent,
    lines,
  };
}
