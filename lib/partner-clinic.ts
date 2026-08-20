import type { Appointment, UserRole } from "@/lib/types";

export function isPartnerClinicRole(role: UserRole | string | undefined): boolean {
  return role === "partner";
}

export function partnerBookingStamp(user: {
  role: UserRole;
  name?: string;
}): Pick<Appointment, "bookedByPartner" | "partnerClinicName"> | Record<string, never> {
  if (!isPartnerClinicRole(user.role)) return {};
  const name = user.name?.trim();
  return {
    bookedByPartner: true,
    partnerClinicName: name || "Партнёрская клиника",
  };
}

export function partnerBookingBadgeLabel(
  apt: Pick<Appointment, "bookedByPartner" | "partnerClinicName">
): string | null {
  if (!apt.bookedByPartner) return null;
  const name = apt.partnerClinicName?.trim();
  return name ? `Записан: ${name}` : "Записан партнёром";
}
