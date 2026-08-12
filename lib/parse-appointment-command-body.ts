import type { Appointment, AppointmentStatus, Patient, PaymentStatus } from "@/lib/types";
import type { AppointmentCommandPatch } from "@/lib/apply-appointment-commands";

const STATUSES: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "ready_for_payment",
  "cancelled",
  "no_show",
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "pending",
  "paid",
  "partial",
  "refunded",
  "cancelled",
];

function asOptionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Разбор полного Appointment из JSON тела create. */
export function parseAppointmentPayload(raw: unknown): Appointment | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = asOptionalString(b.id);
  const patientId = asOptionalString(b.patientId);
  const date = asOptionalString(b.date);
  const startTime = asOptionalString(b.startTime);
  const endTime = asOptionalString(b.endTime);
  if (!id || !patientId || !date || !startTime || !endTime) return null;

  const status =
    typeof b.status === "string" && STATUSES.includes(b.status as AppointmentStatus)
      ? (b.status as AppointmentStatus)
      : "scheduled";
  const paymentStatus =
    typeof b.paymentStatus === "string" &&
    PAYMENT_STATUSES.includes(b.paymentStatus as PaymentStatus)
      ? (b.paymentStatus as PaymentStatus)
      : "pending";

  return {
    id,
    patientId,
    doctorId: asOptionalString(b.doctorId),
    assistantId: asOptionalString(b.assistantId),
    assistantHours:
      typeof b.assistantHours === "number" && Number.isFinite(b.assistantHours)
        ? b.assistantHours
        : undefined,
    serviceId: asOptionalString(b.serviceId),
    cabinetId: asOptionalString(b.cabinetId),
    date,
    startTime,
    endTime,
    durationMinutes: Math.max(1, Math.floor(asNumber(b.durationMinutes, 30))),
    status,
    complaints: asOptionalString(b.complaints),
    reason: asOptionalString(b.reason),
    comment: asOptionalString(b.comment),
    price: Math.max(0, asNumber(b.price, 0)),
    paymentStatus,
    workActId: asOptionalString(b.workActId),
    isOtherClinicVisit: b.isOtherClinicVisit === true ? true : undefined,
    externalClaimId: asOptionalString(b.externalClaimId),
    externalSource: asOptionalString(b.externalSource),
  };
}

/** Частичный patch для update. */
export function parseAppointmentPatch(raw: unknown): AppointmentCommandPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const patch: AppointmentCommandPatch = {};

  if ("patientId" in b) {
    const v = asOptionalString(b.patientId);
    if (!v) return null;
    patch.patientId = v;
  }
  if ("doctorId" in b) patch.doctorId = asOptionalString(b.doctorId);
  if ("assistantId" in b) patch.assistantId = asOptionalString(b.assistantId);
  if ("assistantHours" in b) {
    patch.assistantHours =
      typeof b.assistantHours === "number" && Number.isFinite(b.assistantHours)
        ? b.assistantHours
        : undefined;
  }
  if ("serviceId" in b) patch.serviceId = asOptionalString(b.serviceId);
  if ("cabinetId" in b) patch.cabinetId = asOptionalString(b.cabinetId);
  if ("date" in b) {
    const v = asOptionalString(b.date);
    if (!v) return null;
    patch.date = v;
  }
  if ("startTime" in b) {
    const v = asOptionalString(b.startTime);
    if (!v) return null;
    patch.startTime = v;
  }
  if ("endTime" in b) {
    const v = asOptionalString(b.endTime);
    if (!v) return null;
    patch.endTime = v;
  }
  if ("durationMinutes" in b) {
    patch.durationMinutes = Math.max(1, Math.floor(asNumber(b.durationMinutes, 30)));
  }
  if ("status" in b) {
    if (typeof b.status !== "string" || !STATUSES.includes(b.status as AppointmentStatus)) {
      return null;
    }
    patch.status = b.status as AppointmentStatus;
  }
  if ("complaints" in b) patch.complaints = asOptionalString(b.complaints);
  if ("reason" in b) patch.reason = asOptionalString(b.reason);
  if ("comment" in b) patch.comment = asOptionalString(b.comment);
  if ("price" in b) patch.price = Math.max(0, asNumber(b.price, 0));
  if ("paymentStatus" in b) {
    if (
      typeof b.paymentStatus !== "string" ||
      !PAYMENT_STATUSES.includes(b.paymentStatus as PaymentStatus)
    ) {
      return null;
    }
    patch.paymentStatus = b.paymentStatus as PaymentStatus;
  }
  if ("workActId" in b) {
    patch.workActId =
      b.workActId === null || b.workActId === ""
        ? null
        : asOptionalString(b.workActId);
  }

  return patch;
}

const GENDERS = ["male", "female"] as const;
const PATIENT_STATUSES = ["active", "new", "archived", "debtor", "vip"] as const;
const DISABILITIES = [
  "none",
  "group1",
  "group2",
  "group3",
  "child",
  "not_specified",
] as const;

/** Пациент в теле create — чтобы не создавать запись без ФИО (гонка с flush карточки). */
export function parsePatientPayload(raw: unknown): Patient | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = asOptionalString(b.id);
  const firstName = asOptionalString(b.firstName);
  const lastName = asOptionalString(b.lastName);
  const birthDate = asOptionalString(b.birthDate);
  if (!id || !firstName || !lastName || !birthDate) return null;

  const gender =
    typeof b.gender === "string" && (GENDERS as readonly string[]).includes(b.gender)
      ? (b.gender as Patient["gender"])
      : "female";
  const status =
    typeof b.status === "string" &&
    (PATIENT_STATUSES as readonly string[]).includes(b.status)
      ? (b.status as Patient["status"])
      : "active";
  const disability =
    typeof b.disability === "string" &&
    (DISABILITIES as readonly string[]).includes(b.disability)
      ? (b.disability as Patient["disability"])
      : "not_specified";
  const source =
    typeof b.source === "string" && b.source.trim()
      ? (b.source as Patient["source"])
      : "Сайт";

  const phone = typeof b.phone === "string" ? b.phone : "";
  const createdAt = asOptionalString(b.createdAt) ?? birthDate;

  return {
    id,
    firstName,
    lastName,
    middleName: asOptionalString(b.middleName),
    phone,
    email: asOptionalString(b.email),
    birthDate,
    gender,
    address: asOptionalString(b.address),
    source,
    status,
    notes: asOptionalString(b.notes),
    allergies: Array.isArray(b.allergies)
      ? b.allergies.filter((x): x is string => typeof x === "string")
      : undefined,
    chronicDiseases: Array.isArray(b.chronicDiseases)
      ? b.chronicDiseases.filter((x): x is string => typeof x === "string")
      : undefined,
    createdAt,
    balance: Math.max(0, asNumber(b.balance, 0)),
    totalSpent: Math.max(0, asNumber(b.totalSpent, 0)),
    lastVisitDate: asOptionalString(b.lastVisitDate),
    nextVisitDate: asOptionalString(b.nextVisitDate),
    snils: asOptionalString(b.snils),
    passportSeries: asOptionalString(b.passportSeries),
    passportNumber: asOptionalString(b.passportNumber),
    isChild: b.isChild === true ? true : undefined,
    birthCertificateSeries: asOptionalString(b.birthCertificateSeries),
    birthCertificateNumber: asOptionalString(b.birthCertificateNumber),
    representativeFullName: asOptionalString(b.representativeFullName),
    representativeBirthDate: asOptionalString(b.representativeBirthDate),
    representativePassportSeries: asOptionalString(b.representativePassportSeries),
    representativePassportNumber: asOptionalString(b.representativePassportNumber),
    withoutIdentityDocuments: b.withoutIdentityDocuments === true ? true : undefined,
    diagnosis: asOptionalString(b.diagnosis),
    hadPreviousVisits: b.hadPreviousVisits === true ? true : undefined,
    previousVisitsNote: asOptionalString(b.previousVisitsNote),
    disability,
    notificationPrefs:
      b.notificationPrefs && typeof b.notificationPrefs === "object"
        ? (b.notificationPrefs as Patient["notificationPrefs"])
        : undefined,
  };
}
