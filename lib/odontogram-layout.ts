import { LOWER_TEETH, UPPER_TEETH } from "@/lib/constants";

/** Зоны клика (%), подогнаны под клиническую схему FDI (вид спереди) */
export interface ToothHotspot {
  number: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Ручная разметка под типовую odontogram.png / i.jpg */
const HOTSPOT_MAP: Record<number, Omit<ToothHotspot, "number">> = {
  // Верхняя челюсть — правая сторона пациента (слева на экране) 18→11
  18: { left: 3.8, top: 11, width: 7.2, height: 36 },
  17: { left: 9.8, top: 10.5, width: 6.8, height: 37 },
  16: { left: 15.8, top: 10, width: 6.8, height: 38 },
  15: { left: 21.8, top: 11, width: 5.8, height: 36 },
  14: { left: 26.8, top: 12, width: 5.2, height: 35 },
  13: { left: 31.2, top: 13, width: 4.8, height: 34 },
  12: { left: 35.2, top: 14, width: 4.2, height: 33 },
  11: { left: 38.8, top: 15, width: 4, height: 32 },
  // Верхняя — левая сторона пациента (справа на экране) 21→28
  21: { left: 57.2, top: 15, width: 4, height: 32 },
  22: { left: 60.8, top: 14, width: 4.2, height: 33 },
  23: { left: 64.8, top: 13, width: 4.8, height: 34 },
  24: { left: 69.2, top: 12, width: 5.2, height: 35 },
  25: { left: 74.2, top: 11, width: 5.8, height: 36 },
  26: { left: 80.2, top: 10, width: 6.8, height: 38 },
  27: { left: 86.2, top: 10.5, width: 6.8, height: 37 },
  28: { left: 92.2, top: 11, width: 7.2, height: 36 },
  // Нижняя — правая 48→41
  48: { left: 3.8, top: 53, width: 7.2, height: 36 },
  47: { left: 9.8, top: 52.5, width: 6.8, height: 37 },
  46: { left: 15.8, top: 52, width: 6.8, height: 38 },
  45: { left: 21.8, top: 53, width: 5.8, height: 36 },
  44: { left: 26.8, top: 54, width: 5.2, height: 35 },
  43: { left: 31.2, top: 55, width: 4.8, height: 34 },
  42: { left: 35.2, top: 56, width: 4.2, height: 33 },
  41: { left: 38.8, top: 57, width: 4, height: 32 },
  // Нижняя — левая 31→38
  31: { left: 57.2, top: 57, width: 4, height: 32 },
  32: { left: 60.8, top: 56, width: 4.2, height: 33 },
  33: { left: 64.8, top: 55, width: 4.8, height: 34 },
  34: { left: 69.2, top: 54, width: 5.2, height: 35 },
  35: { left: 74.2, top: 53, width: 5.8, height: 36 },
  36: { left: 80.2, top: 52, width: 6.8, height: 38 },
  37: { left: 86.2, top: 52.5, width: 6.8, height: 37 },
  38: { left: 92.2, top: 53, width: 7.2, height: 36 },
};

export const ODONTOGRAM_HOTSPOTS: ToothHotspot[] = [...UPPER_TEETH, ...LOWER_TEETH].map(
  (number) => ({
    number,
    ...(HOTSPOT_MAP[number] ?? { left: 0, top: 0, width: 5, height: 30 }),
  })
);

export function getHotspot(number: number): ToothHotspot | undefined {
  return ODONTOGRAM_HOTSPOTS.find((h) => h.number === number);
}
