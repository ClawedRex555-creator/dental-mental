import "server-only";

import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";
import { resolveDoctorStaffId } from "@/lib/doctor-salary";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import type {
  AppointmentStatus,
  Patient,
  Service,
  TreatmentPlan,
} from "@/lib/types";

export interface MobileStaffPatientSummary {
  id: string;
  fullName: string;
  birthDate: string;
  gender: string;
  status: string;
  lastVisitDate?: string;
  nextVisitDate?: string;
  balance: number;
  /** Phone hidden for doctors (same as web RBAC). */
  phone?: string;
}

export interface MobileStaffPatientDetail extends MobileStaffPatientSummary {
  email?: string;
  address?: string;
  notes?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  diagnosis?: string;
  totalSpent: number;
}

export interface MobileStaffTreatmentPlanSummary {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  title: string;
  status: string;
  finalAmount: number;
  itemsCount: number;
  createdAt: string;
}

export interface MobileStaffTreatmentPlanDetail extends MobileStaffTreatmentPlanSummary {
  comment?: string;
  totalAmount: number;
  discount: number;
  discountType: string;
  items: Array<{
    id: string;
    serviceName: string;
    toothNumber?: number;
    price: number;
    quantity: number;
    status: string;
  }>;
}

export interface MobileStaffServiceItem {
  id: string;
  name: string;
  category?: string;
  price: number;
  durationMinutes?: number;
}

function patientFullName(p: Patient): string {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

function mapPatientSummary(
  p: Patient,
  includePhone: boolean
): MobileStaffPatientSummary {
  return {
    id: p.id,
    fullName: patientFullName(p),
    birthDate: p.birthDate,
    gender: p.gender === "male" ? "Мужской" : p.gender === "female" ? "Женский" : p.gender || "—",
    status: p.status,
    lastVisitDate: p.lastVisitDate,
    nextVisitDate: p.nextVisitDate,
    balance: p.balance ?? 0,
    phone: includePhone ? p.phone : undefined,
  };
}

export async function listMobileStaffPatients(
  clinicId: string,
  session: MobileTokenPayload,
  options?: { query?: string | null }
): Promise<MobileStaffPatientSummary[]> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return [];

  const includePhone = session.role !== "doctor" && session.role !== "accountant";
  const q = options?.query?.trim().toLowerCase() ?? "";

  let patients = [...(data.patients ?? [])];
  if (q) {
    patients = patients.filter((p) => {
      const name = patientFullName(p).toLowerCase();
      const phone = p.phone.replace(/\D/g, "");
      return name.includes(q) || phone.includes(q.replace(/\D/g, ""));
    });
  }

  patients.sort((a, b) => patientFullName(a).localeCompare(patientFullName(b), "ru"));
  return patients.map((p) => mapPatientSummary(p, includePhone));
}

export async function getMobileStaffPatient(
  clinicId: string,
  session: MobileTokenPayload,
  patientId: string
): Promise<MobileStaffPatientDetail | null> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return null;

  const patient = data.patients.find((p) => p.id === patientId);
  if (!patient) return null;

  const includePhone = session.role !== "doctor" && session.role !== "accountant";
  const summary = mapPatientSummary(patient, includePhone);

  // Бухгалтер: только finance-сводка (как web filterClinicSnapshotForAccountant).
  if (session.role === "accountant") {
    return {
      ...summary,
      totalSpent: patient.totalSpent ?? 0,
    };
  }

  return {
    ...summary,
    email: patient.email,
    address: patient.address,
    notes: patient.notes,
    allergies: patient.allergies,
    chronicDiseases: patient.chronicDiseases,
    diagnosis: patient.diagnosis,
    totalSpent: patient.totalSpent ?? 0,
  };
}

export async function listMobileStaffTreatmentPlans(
  clinicId: string,
  session: MobileTokenPayload,
  options?: { patientId?: string | null }
): Promise<MobileStaffTreatmentPlanSummary[]> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return [];

  // Бухгалтер / ассистент — без клинических планов лечения
  if (session.role === "accountant" || session.role === "assistant") {
    return [];
  }

  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  let plans = [...(data.treatmentPlans ?? [])];

  // Врач — только свои планы; owner/admin — все
  if (session.role === "doctor" && doctorId) {
    plans = plans.filter((p) => p.doctorId === doctorId);
  }

  if (options?.patientId) {
    plans = plans.filter((p) => p.patientId === options.patientId);
  }

  // Prefer doctor's own plans first, then others
  plans.sort((a, b) => {
    const aOwn = doctorId && a.doctorId === doctorId ? 0 : 1;
    const bOwn = doctorId && b.doctorId === doctorId ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return plans.map((plan) => mapPlanSummary(plan, data.patients, data.doctors));
}

export async function getMobileStaffTreatmentPlan(
  clinicId: string,
  session: MobileTokenPayload,
  planId: string
): Promise<MobileStaffTreatmentPlanDetail | null> {
  if (session.role === "accountant" || session.role === "assistant") {
    return null;
  }

  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return null;

  const plan = data.treatmentPlans.find((p) => p.id === planId);
  if (!plan) return null;

  if (session.role === "doctor") {
    const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
    if (!doctorId || plan.doctorId !== doctorId) return null;
  }

  const summary = mapPlanSummary(plan, data.patients, data.doctors);
  return {
    ...summary,
    comment: plan.comment,
    totalAmount: plan.totalAmount,
    discount: plan.discount,
    discountType: plan.discountType,
    items: plan.items.map((item) => ({
      id: item.id,
      serviceName: item.serviceName,
      toothNumber: item.toothNumber,
      price: item.price,
      quantity: item.quantity ?? 1,
      status: item.status,
    })),
  };
}

function mapPlanSummary(
  plan: TreatmentPlan,
  patients: Patient[],
  doctors: { id: string; name: string }[]
): MobileStaffTreatmentPlanSummary {
  const patient = patients.find((p) => p.id === plan.patientId);
  const doctor = doctors.find((d) => d.id === plan.doctorId);
  return {
    id: plan.id,
    patientId: plan.patientId,
    patientName: patient ? patientFullName(patient) : "—",
    doctorId: plan.doctorId,
    doctorName: doctor?.name ?? "—",
    title: plan.title,
    status: plan.status,
    finalAmount: plan.finalAmount,
    itemsCount: plan.items.length,
    createdAt: plan.createdAt,
  };
}

export async function listMobileStaffServices(
  clinicId: string
): Promise<MobileStaffServiceItem[]> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) return [];

  return (data.services ?? [])
    .filter((s: Service) => s.active !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      price: s.price ?? 0,
      durationMinutes: s.duration,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, AppointmentStatus[]> = {
  scheduled: ["confirmed", "arrived", "in_progress", "cancelled", "no_show"],
  confirmed: ["arrived", "in_progress", "cancelled", "no_show"],
  arrived: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "ready_for_payment", "cancelled"],
  // Mobile maps many statuses to "scheduled" — accept updates from those too
};

export async function updateMobileStaffAppointmentStatus(
  clinicId: string,
  session: MobileTokenPayload,
  appointmentId: string,
  nextStatus: AppointmentStatus,
  notes?: string
): Promise<{ id: string; status: AppointmentStatus } | null> {
  const allowedMobile = [
    "confirmed",
    "arrived",
    "in_progress",
    "completed",
    "ready_for_payment",
    "cancelled",
    "no_show",
  ] as const;
  if (!allowedMobile.includes(nextStatus as (typeof allowedMobile)[number])) {
    throw new Error("Недопустимый статус");
  }

  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  if (!record?.data) return null;

  const data = record.data;
  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  const idx = data.appointments.findIndex((a) => a.id === appointmentId);
  if (idx < 0) return null;

  const appointment = data.appointments[idx];
  if (session.role === "doctor" && doctorId && appointment.doctorId !== doctorId) {
    throw new Error("Можно менять только свои приёмы");
  }

  const from = appointment.status;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [
    "in_progress",
    "completed",
    "cancelled",
  ];
  // Be permissive for mobile: allow in_progress and completed from common active states
  const canUpdate =
    allowed.includes(nextStatus) ||
    (["scheduled", "confirmed", "arrived", "in_progress"].includes(from) &&
      ["in_progress", "completed", "cancelled"].includes(nextStatus));

  if (!canUpdate) {
    throw new Error(`Нельзя сменить статус с «${from}» на «${nextStatus}»`);
  }

  const updated = {
    ...appointment,
    status: nextStatus,
    comment: notes?.trim() ? notes.trim() : appointment.comment,
  };

  const appointments = [...data.appointments];
  appointments[idx] = updated;

  await saveClinicDataDb(clinicId, { ...data, appointments }, { allowEmptyResult: true });

  return { id: updated.id, status: updated.status };
}
