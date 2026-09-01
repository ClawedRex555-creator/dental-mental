import type { Appointment, OnlineBookingRequest } from "@/lib/types";

/** Маркер приёма, созданного из мобильного приложения / формы онлайн-записи. */
export const MOBILE_APP_BOOKING_SOURCE = "Приложение";

/** Класс бирки в ячейке расписания (читаемо и в тёмной теме). */
export const ONLINE_BOOKING_SCHEDULE_BADGE_CLASS =
  "mt-0.5 inline-block max-w-full truncate rounded border border-teal-700/10 bg-teal-900/5 px-1 py-px text-[10px] font-medium text-teal-900/80 dark:border-teal-200/15 dark:bg-teal-200/10 dark:text-teal-50/70";

export function isMobileAppBookingAppointment(
  apt: Pick<Appointment, "externalSource" | "externalClaimId">
): boolean {
  if (apt.externalSource === MOBILE_APP_BOOKING_SOURCE) return true;
  if (apt.externalSource?.toLowerCase() === "tstom") return true;
  return Boolean(apt.externalClaimId?.startsWith("ob"));
}

export function onlineBookingBadgeLabel(
  apt: Pick<Appointment, "externalSource" | "externalClaimId">,
  options?: { short?: boolean }
): string | null {
  if (!isMobileAppBookingAppointment(apt)) return null;
  return options?.short ? "Приложение" : "Запись через приложение";
}

export function isMedflexBookingAppointment(
  apt: Pick<Appointment, "externalSource" | "externalClaimId">
): boolean {
  if (isMobileAppBookingAppointment(apt)) return false;
  if (apt.externalSource && /prodoctorov|medflex/i.test(apt.externalSource)) {
    return true;
  }
  // MedFlex: UUID claim_id; приложение — id заявки с префиксом ob
  return Boolean(apt.externalClaimId && !apt.externalClaimId.startsWith("ob"));
}

export function isPendingOnlineBooking(
  booking: Pick<OnlineBookingRequest, "status">
): boolean {
  return booking.status === "new" || booking.status === "contacted";
}

export function countPendingOnlineBookings(
  bookings: OnlineBookingRequest[]
): number {
  return bookings.filter(isPendingOnlineBooking).length;
}
