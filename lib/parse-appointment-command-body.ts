import type { Appointment, AppointmentStatus, PaymentStatus } from "@/lib/types";

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
export function parseAppointmentPatch(raw: unknown): Partial<Appointment> | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const patch: Partial<Appointment> = {};

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
  if ("workActId" in b) patch.workActId = asOptionalString(b.workActId);

  return patch;
}
