/** Справочник специальностей MedFlex (стоматология) + эвристика по тексту */

export const MEDFLEX_DENTAL_SPECIALTIES: Array<{ id: string; name: string; aliases: string[] }> = [
  { id: "48", name: "Стоматолог", aliases: ["стоматолог", "терапевт", "врач-стоматолог"] },
  { id: "47", name: "Стоматолог-ортопед", aliases: ["ортопед", "стоматолог-ортопед"] },
  { id: "46", name: "Стоматолог-ортодонт", aliases: ["ортодонт", "стоматолог-ортодонт"] },
  { id: "49", name: "Стоматолог-хирург", aliases: ["хирург", "стоматолог-хирург"] },
  { id: "191", name: "Стоматолог-имплантолог", aliases: ["имплантолог", "имплант"] },
  { id: "168", name: "Стоматолог-гигиенист", aliases: ["гигиенист"] },
  { id: "305", name: "Стоматолог-эндодонтист", aliases: ["эндодонт", "эндодонтист"] },
  { id: "50", name: "Детский стоматолог", aliases: ["детский стоматолог", "детский"] },
];

export function mapDoctorSpecialtyToMedflex(specialization: string): {
  id: string;
  name: string;
} {
  const text = specialization.trim().toLowerCase();
  if (!text) {
    return { id: "48", name: "Стоматолог" };
  }
  for (const row of MEDFLEX_DENTAL_SPECIALTIES) {
    if (row.aliases.some((a) => text.includes(a))) {
      return { id: row.id, name: row.name };
    }
  }
  return { id: "48", name: "Стоматолог" };
}
