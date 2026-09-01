import "server-only";

import {
  getClinicDataDbWithLegacyStaff,
} from "@/lib/clinic-data-db.server";
import { executeAppointmentCommandSave } from "@/lib/clinic-appointment-command.server";
import { applyUpdateAppointmentToPersistedState } from "@/lib/apply-appointment-commands";
import { applyUpsertWorkActToPersistedState } from "@/lib/apply-work-act-commands";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";
import { resolveDoctorStaffId } from "@/lib/doctor-salary";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import type {
  AppointmentStatus,
  Patient,
  Service,
  TreatmentPlan,
  UserRole,
  WorkAct,
  WorkActItem,
} from "@/lib/types";
import { generateId } from "@/lib/utils";
import {
  buildMobileStaffPatientCard,
  mapTreatmentPlanForMobile,
  type MobileStaffPatientCard,
} from "@/lib/mobile-staff-patient-card.server";

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
  /** Полная карточка: визиты, медкарта, финансы (как на сайте) */
  card?: MobileStaffPatientCard;
}

export interface MobileStaffTreatmentPlanSummary {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  title: string;
  status: string;
  statusLabel: string;
  finalAmount: number;
  itemsCount: number;
  createdAt: string;
  /** Готовая строка для списка в приложении */
  summaryLine: string;
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
    const card = buildMobileStaffPatientCard(patient, data);
    return {
      ...summary,
      totalSpent: patient.totalSpent ?? 0,
      card: { visits: [], medicalRecords: [], finance: card.finance },
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
    card: buildMobileStaffPatientCard(patient, data),
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
      statusLabel:
        item.status === "completed"
          ? "Выполнено"
          : item.status === "cancelled"
            ? "Отменено"
            : "Запланировано",
    })),
  };
}

function mapPlanSummary(
  plan: TreatmentPlan,
  patients: Patient[],
  doctors: { id: string; name: string }[]
): MobileStaffTreatmentPlanSummary {
  return mapTreatmentPlanForMobile(plan, patients, doctors);
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

const ADMIN_STATUS_ROLES: UserRole[] = ["owner", "admin"];

function assertMobileAppointmentStatusChange(
  role: UserRole,
  from: AppointmentStatus,
  to: AppointmentStatus
): void {
  if (role === "doctor") {
    if (to !== "completed") {
      throw new Error("Врач может только завершить приём или оформить акт");
    }
    if (from !== "in_progress") {
      throw new Error("Завершить можно только приём «На приёме»");
    }
    return;
  }
  if (!ADMIN_STATUS_ROLES.includes(role)) {
    throw new Error("Статус приёма меняет только администратор");
  }
}

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
  const appointment = data.appointments.find((a) => a.id === appointmentId);
  if (!appointment) return null;

  if (
    session.role === "doctor" &&
    doctorId &&
    appointment.doctorId !== doctorId
  ) {
    throw new Error("Можно менять только свои приёмы");
  }

  assertMobileAppointmentStatusChange(
    session.role as UserRole,
    appointment.status,
    nextStatus
  );

  const patch: { status: AppointmentStatus; comment?: string } = { status: nextStatus };
  if (notes?.trim()) {
    patch.comment = notes.trim();
  }

  const saved = await executeAppointmentCommandSave(clinicId, (state) => {
    const current = state.appointments.find((a) => a.id === appointmentId);
    if (!current) return { ok: false, error: "Приём не найден" };
    if (
      session.role === "doctor" &&
      doctorId &&
      current.doctorId !== doctorId
    ) {
      return { ok: false, error: "Можно менять только свои приёмы" };
    }
    try {
      assertMobileAppointmentStatusChange(
        session.role as UserRole,
        current.status,
        nextStatus
      );
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Недопустимая смена статуса",
      };
    }
    return applyUpdateAppointmentToPersistedState(state, appointmentId, patch);
  });

  if (!saved.ok) {
    throw new Error(saved.error);
  }

  return { id: appointmentId, status: nextStatus };
}

export interface MobileWorkActItemInput {
  serviceId?: string;
  serviceName: string;
  price: number;
  quantity?: number;
}

export async function createMobileStaffWorkAct(
  clinicId: string,
  session: MobileTokenPayload,
  input: {
    appointmentId: string;
    items: MobileWorkActItemInput[];
    notes?: string;
    submittedToAdmin?: boolean;
  }
): Promise<{ actId: string; actNumber: string; appointmentStatus: AppointmentStatus }> {
  if (session.role === "accountant" || session.role === "assistant") {
    throw new Error("Создание акта недоступно для этой роли");
  }

  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  if (!record?.data) {
    throw new Error("Нет данных клиники");
  }

  const data = record.data;
  const doctorId = resolveDoctorStaffId(session.staffId, session.email, data.doctors);
  const appointment = data.appointments.find((a) => a.id === input.appointmentId);
  if (!appointment) {
    throw new Error("Приём не найден");
  }
  if (session.role === "doctor") {
    if (!doctorId || appointment.doctorId !== doctorId) {
      throw new Error("Можно оформить акт только по своему приёму");
    }
    if (appointment.status !== "completed") {
      throw new Error("Сначала завершите приём, затем оформите акт");
    }
  } else if (!ADMIN_STATUS_ROLES.includes(session.role as UserRole)) {
    throw new Error("Создание акта доступно врачу или администратору");
  } else if (appointment.status !== "completed" && appointment.status !== "in_progress") {
    throw new Error("Акт можно оформить после завершения приёма");
  }

  const actDoctorId = appointment.doctorId ?? doctorId;
  if (!actDoctorId) {
    throw new Error("Не указан врач приёма");
  }

  const items: WorkActItem[] = input.items.map((line) => {
    const quantity = line.quantity ?? 1;
    const price = line.price;
    return {
      id: generateId("wai"),
      serviceId: line.serviceId,
      serviceName: line.serviceName.trim(),
      price,
      quantity,
      total: price * quantity,
    };
  });

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * (item.quantity ?? 1),
    0
  );

  const act: WorkAct = {
    id: generateId("wa"),
    actNumber: "",
    actDate: appointment.date,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    doctorId: actDoctorId,
    items,
    subtotalAmount: subtotal,
    discountType: "percent",
    discount: 0,
    totalAmount: subtotal,
    paymentStatus: "pending",
    createdAt: new Date().toISOString(),
    notes: input.notes?.trim() || undefined,
    submittedToAdmin: input.submittedToAdmin ?? false,
  };

  const submittedToAdmin = input.submittedToAdmin ?? false;
  const saved = await executeAppointmentCommandSave(clinicId, (state) => {
    const current = state.appointments.find((a) => a.id === input.appointmentId);
    if (!current) {
      return { ok: false, error: "Приём не найден" };
    }
    if (session.role === "doctor" && current.status !== "completed") {
      return { ok: false, error: "Сначала завершите приём, затем оформите акт" };
    }

    const applied = applyUpsertWorkActToPersistedState(state, act, {
      linkAppointmentId: appointment.id,
      submittedToAdmin,
    });
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.actId,
      alreadyApplied: applied.alreadyApplied,
    };
  });

  if (!saved.ok) {
    throw new Error(saved.error);
  }

  const after = await getClinicDataDbWithLegacyStaff(clinicId);
  const savedAct = after?.data?.workActs.find((a) => a.id === act.id);
  const savedAppointment = after?.data?.appointments.find(
    (a) => a.id === appointment.id
  );

  return {
    actId: act.id,
    actNumber: savedAct?.actNumber ?? "",
    appointmentStatus: savedAppointment?.status ?? appointment.status,
  };
}
