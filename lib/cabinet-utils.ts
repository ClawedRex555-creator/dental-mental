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

/** Кабинет врача: cabinetId на карточке или привязка через staffIds кабинета */
export function resolveCabinetIdForDoctor(
  doctorId: string | undefined,
  doctors: Doctor[],
  cabinets: Cabinet[]
): string | undefined {
  if (!doctorId) return undefined;
  const doctor = doctors.find((d) => d.id === doctorId);
  if (doctor?.cabinetId) {
    const linked = cabinets.find((c) => c.id === doctor.cabinetId);
    if (linked) return linked.id;
  }
  return cabinets.find((c) => c.staffIds.includes(doctorId))?.id;
}
