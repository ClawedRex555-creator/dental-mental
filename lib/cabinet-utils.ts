import type { Cabinet, Doctor } from "@/lib/types";

/** Врачи, привязанные к кабинету (staffIds + cabinetId) */
export function getDoctorsInCabinet(
  cabinetId: string,
  doctors: Doctor[],
  cabinets: Cabinet[]
): Doctor[] {
  const cabinet = cabinets.find((c) => c.id === cabinetId);
  const staffIds = new Set<string>([
    ...(cabinet?.staffIds ?? []),
    ...doctors.filter((d) => d.cabinetId === cabinetId).map((d) => d.id),
  ]);
  return doctors.filter((d) => d.role === "doctor" && staffIds.has(d.id));
}
