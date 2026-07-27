/** Должности NSI 1.2.643.5.1.13.13.11.1002 — стоматология */

export const NSI_POSITION_DENTIST = "100";
export const NSI_POSITION_DENTIST_NAME = "врач-стоматолог";

/** Известные стоматологические должности (1002) */
export const DENTAL_POSITION_BY_CODE: Record<string, string> = {
  "100": "врач-стоматолог",
  "101": "врач-стоматолог детский",
  "102": "врач-стоматолог-ортопед",
  "103": "врач-стоматолог-терапевт",
  "104": "врач-стоматолог-хирург",
};

/** Специальности NSI 1.2.643.5.1.13.13.11.1066 */
export const NSI_SPECIALITY_DENTISTRY_GP = "171";
export const NSI_SPECIALITY_DENTISTRY_GP_NAME = "Стоматология общей практики";

export const DENTAL_SPECIALITY_BY_CODE: Record<string, string> = {
  "171": "Стоматология общей практики",
  "173": "Ортодонтия",
  "174": "Стоматология детская",
  "175": "Стоматология ортопедическая",
  "176": "Стоматология терапевтическая",
  "177": "Стоматология хирургическая",
  "208": "Стоматология",
};

/** Значения из минимального примера N3 (травматология) — не для стоматологии */
const LEGACY_SAMPLE_POSITION = new Set(["34", "114"]);
const LEGACY_SAMPLE_SPECIALITY = new Set(["28"]);

export function mapSpecializationToPositionCode(specialization?: string): string {
  const text = (specialization ?? "").toLowerCase();
  if (text.includes("детск")) return "101";
  if (text.includes("ортодонт")) return "100"; // ортодонт ≠ ортопед в 1002; ближе общий стоматолог
  if (text.includes("ортопед")) return "102";
  if (text.includes("хирург") || text.includes("имплант")) return "104";
  if (text.includes("терапевт") || text.includes("кариес")) return "103";
  if (text.includes("гигиенист")) return "100";
  return NSI_POSITION_DENTIST;
}

export function mapSpecializationToN3SpecialityId(specialization?: string): string {
  const text = (specialization ?? "").toLowerCase();
  if (text.includes("ортодонт")) return "173";
  if (text.includes("детск")) return "174";
  if (text.includes("ортопед")) return "175";
  if (text.includes("хирург") || text.includes("имплант")) return "177";
  if (text.includes("терапевт")) return "176";
  return NSI_SPECIALITY_DENTISTRY_GP;
}

export function resolveDoctorPositionCode(input: {
  positionCode?: string;
  specialization?: string;
}): { code: string; displayName: string } {
  const raw = input.positionCode?.trim();
  const code =
    !raw || LEGACY_SAMPLE_POSITION.has(raw)
      ? mapSpecializationToPositionCode(input.specialization)
      : raw;
  const displayName =
    DENTAL_POSITION_BY_CODE[code] ??
    (input.specialization?.trim() || NSI_POSITION_DENTIST_NAME);
  return { code, displayName };
}

export function resolveDoctorN3PositionId(input: {
  n3PositionId?: string;
  positionCode?: string;
  specialization?: string;
}): string {
  const raw = input.n3PositionId?.trim();
  if (raw && !LEGACY_SAMPLE_POSITION.has(raw)) return raw;
  return resolveDoctorPositionCode(input).code;
}

export function resolveDoctorN3SpecialityId(input: {
  n3SpecialityId?: string;
  specialization?: string;
}): string {
  const raw = input.n3SpecialityId?.trim();
  if (raw && !LEGACY_SAMPLE_SPECIALITY.has(raw)) return raw;
  return mapSpecializationToN3SpecialityId(input.specialization);
}
