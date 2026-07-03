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

function normalizeCabinetLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cabinetMatchesDoctorLabel(cabinet: Cabinet, label: string): boolean {
  const normalized = normalizeCabinetLabel(label);
  if (!normalized || normalized === "—" || normalized === "-") return false;
  const name = normalizeCabinetLabel(cabinet.name);
  const variants = new Set([
    name,
    normalizeCabinetLabel(`${cabinet.name} №${cabinet.number}`),
    normalizeCabinetLabel(`${cabinet.name} ${cabinet.number}`),
    normalizeCabinetLabel(`кабинет ${cabinet.number}`),
    normalizeCabinetLabel(`кабинет №${cabinet.number}`),
  ]);
  return variants.has(normalized);
}

/** Кабинет врача: cabinetId на карточке, staffIds кабинета или устаревшее поле cabinet */
export function resolveCabinetIdForDoctor(
  doctorId: string | undefined,
  doctors: Doctor[],
  cabinets: Cabinet[]
): string | undefined {
  if (!doctorId) return undefined;
  const doctor = doctors.find((d) => d.id === doctorId);
  if (!doctor) return undefined;

  if (doctor.cabinetId) {
    const linked = cabinets.find((c) => c.id === doctor.cabinetId);
    if (linked) return linked.id;
  }

  const viaStaffIds = cabinets.find((c) => (c.staffIds ?? []).includes(doctorId));
  if (viaStaffIds) return viaStaffIds.id;

  if (doctor.cabinet) {
    const viaName = cabinets.find((c) => cabinetMatchesDoctorLabel(c, doctor.cabinet));
    if (viaName) return viaName.id;
  }

  return undefined;
}
