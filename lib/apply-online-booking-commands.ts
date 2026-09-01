import {
  calcEndTime,
  findAppointmentConflicts,
  isDoctorIntervalFree,
  toMinutes,
} from "@/lib/appointment-utils";
import {
  getDoctorHoursForDate,
  isIntervalWithinDoctorHours,
} from "@/lib/clinic-schedule";
import type { ApplyAppointmentResult } from "@/lib/apply-appointment-commands";
import {
  applyCreateAppointmentToPersistedState,
  upsertPatientInPersistedState,
} from "@/lib/apply-appointment-commands";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { MOBILE_APP_BOOKING_SOURCE } from "@/lib/online-booking";
import { resolveCabinetIdForDoctor } from "@/lib/cabinet-utils";
import type {
  Appointment,
  OnlineBookingRequest,
  OnlineBookingStatus,
  Patient,
} from "@/lib/types";
import { generateId } from "@/lib/utils";

function digitsPhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d;
}

function findPatientByPhone(patients: Patient[], phone: string): Patient | undefined {
  const want = digitsPhone(phone);
  if (!want) return undefined;
  return patients.find((p) => {
    const have = digitsPhone(p.phone);
    return have === want || have.endsWith(want.slice(-10)) || want.endsWith(have.slice(-10));
  });
}

function parsePatientName(fullName: string): Pick<Patient, "firstName" | "lastName" | "middleName"> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "—", lastName: "—" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "—" };
  return {
    lastName: parts[0]!,
    firstName: parts[1]!,
    middleName: parts.slice(2).join(" ") || undefined,
  };
}

function ensurePatientFromBooking(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest
): { state: ClinicPersistedState; patient: Patient } {
  const existing = findPatientByPhone(state.patients, booking.phone);
  if (existing) {
    const parsed = parsePatientName(booking.patientName);
    const updated: Patient = {
      ...existing,
      firstName: parsed.firstName !== "—" ? parsed.firstName : existing.firstName,
      lastName: parsed.lastName !== "—" ? parsed.lastName : existing.lastName,
      middleName: parsed.middleName ?? existing.middleName,
    };
    return {
      state: upsertPatientInPersistedState(state, updated),
      patient: updated,
    };
  }

  const parsed = parsePatientName(booking.patientName);
  const patient: Patient = {
    id: generateId("pat"),
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    middleName: parsed.middleName,
    phone: digitsPhone(booking.phone),
    birthDate: "1990-01-01",
    gender: "male",
    source: "Сайт",
    status: "new",
    createdAt: new Date().toISOString().slice(0, 10),
    balance: 0,
    totalSpent: 0,
    disability: "none",
    notes: "Создан из онлайн-записи (приложение / форма)",
  };
  return {
    state: upsertPatientInPersistedState(state, patient),
    patient,
  };
}

function findAppointmentForBooking(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest
): Appointment | undefined {
  if (booking.appointmentId) {
    const byId = state.appointments.find((a) => a.id === booking.appointmentId);
    if (byId) return byId;
  }
  return state.appointments.find((a) => a.externalClaimId === booking.id);
}

function resolveDoctorForBooking(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest,
  durationMinutes: number
): string | null {
  const endTime = calcEndTime(booking.time, durationMinutes);
  const candidates = booking.doctorId
    ? state.doctors.filter((d) => d.id === booking.doctorId)
    : state.doctors.filter((d) => d.status === "active" && (d.role === "doctor" || !d.role));

  for (const doctor of candidates) {
    if (doctor.status !== "active") continue;
    const hours = getDoctorHoursForDate(doctor.id, booking.date, state.doctorSchedules);
    if (!hours) continue;
    if (
      toMinutes(booking.time) < toMinutes(hours.startTime) ||
      toMinutes(endTime) > toMinutes(hours.endTime)
    ) {
      continue;
    }
    if (
      isDoctorIntervalFree(
        state.appointments,
        booking.date,
        booking.time,
        endTime,
        doctor.id
      )
    ) {
      return doctor.id;
    }
  }

  return booking.doctorId ?? candidates.find((d) => d.status === "active")?.id ?? null;
}

function buildAppointmentFromBooking(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest,
  patient: Patient
): ApplyAppointmentResult {
  const service = state.services.find((s) => s.id === booking.serviceId);
  const durationMinutes = service?.duration ?? 30;
  const endTime = calcEndTime(booking.time, durationMinutes);
  const doctorId = resolveDoctorForBooking(state, booking, durationMinutes);

  if (!doctorId) {
    return { ok: false, error: "Не удалось подобрать врача для записи" };
  }

  const cabinetId =
    resolveCabinetIdForDoctor(doctorId, state.doctors, state.cabinets) ?? undefined;

  const payload: Appointment = {
    id: generateId("apt"),
    patientId: patient.id,
    doctorId,
    cabinetId,
    serviceId: booking.serviceId !== "unknown" ? booking.serviceId : undefined,
    date: booking.date,
    startTime: booking.time,
    endTime,
    durationMinutes,
    status: "scheduled",
    comment:
      [
        booking.comment?.trim(),
        `Онлайн-запись ${booking.id}`,
        `source=${MOBILE_APP_BOOKING_SOURCE}`,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    price: service?.price ?? 0,
    paymentStatus: "pending",
    externalClaimId: booking.id,
    externalSource: MOBILE_APP_BOOKING_SOURCE,
  };

  if (
    !isIntervalWithinDoctorHours(
      doctorId,
      booking.date,
      booking.time,
      endTime,
      state.doctorSchedules
    )
  ) {
    return { ok: false, error: "Выбранное время вне графика врача" };
  }

  const conflicts = findAppointmentConflicts(state.appointments, {
    date: booking.date,
    startTime: booking.time,
    endTime,
    doctorId,
    cabinetId,
    patientId: patient.id,
  });
  if (conflicts.length > 0) {
    return { ok: false, error: "Выбранное время уже занято" };
  }

  return applyCreateAppointmentToPersistedState(state, payload, patient);
}

export function ensureAppointmentForOnlineBooking(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest
): ApplyAppointmentResult {
  const existing = findAppointmentForBooking(state, booking);
  if (existing) {
    const nextBookings = state.onlineBookings.map((b) =>
      b.id === booking.id
        ? { ...b, appointmentId: existing.id, status: "booked" as const }
        : b
    );
    return {
      ok: true,
      state: { ...state, onlineBookings: nextBookings },
      appointmentId: existing.id,
      alreadyApplied: true,
    };
  }

  const withPatient = ensurePatientFromBooking(state, booking);
  const created = buildAppointmentFromBooking(withPatient.state, booking, withPatient.patient);
  if (!created.ok) return created;

  const appointmentId = created.appointmentId;
  const nextBookings = created.state.onlineBookings.map((b) =>
    b.id === booking.id ? { ...b, appointmentId, status: "booked" as const } : b
  );

  return {
    ok: true,
    state: { ...created.state, onlineBookings: nextBookings },
    appointmentId,
    alreadyApplied: false,
  };
}

export function applyUpdateOnlineBookingToPersistedState(
  state: ClinicPersistedState,
  bookingId: string,
  status: OnlineBookingStatus
): ApplyAppointmentResult {
  const booking = state.onlineBookings.find((b) => b.id === bookingId);
  if (!booking) {
    return { ok: false, error: "Заявка не найдена" };
  }

  if (booking.status === status) {
    const existing = findAppointmentForBooking(state, booking);
    return {
      ok: true,
      state,
      appointmentId: existing?.id ?? bookingId,
      alreadyApplied: true,
    };
  }

  let nextState = state;
  let appointmentId = booking.appointmentId ?? findAppointmentForBooking(state, booking)?.id;

  if (status === "booked") {
    const ensured = ensureAppointmentForOnlineBooking(nextState, booking);
    if (!ensured.ok) return ensured;
    nextState = ensured.state;
    appointmentId = ensured.appointmentId;
  }

  if (status === "cancelled" && appointmentId) {
    nextState = {
      ...nextState,
      appointments: nextState.appointments.map((a) =>
        a.id === appointmentId ? { ...a, status: "cancelled" as const } : a
      ),
    };
  }

  nextState = {
    ...nextState,
    onlineBookings: nextState.onlineBookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            status,
            ...(appointmentId ? { appointmentId } : {}),
          }
        : b
    ),
  };

  return {
    ok: true,
    state: nextState,
    appointmentId: appointmentId ?? bookingId,
    alreadyApplied: false,
  };
}

/** Создать заявку и сразу приём в расписании (мобильное приложение). */
export function applyMobileOnlineBookingToPersistedState(
  state: ClinicPersistedState,
  booking: OnlineBookingRequest
): ApplyAppointmentResult {
  const withBooking: ClinicPersistedState = {
    ...state,
    onlineBookings: [booking, ...state.onlineBookings.filter((b) => b.id !== booking.id)],
  };
  const booked: OnlineBookingRequest = { ...booking, status: "booked" };
  return ensureAppointmentForOnlineBooking(withBooking, booked);
}
