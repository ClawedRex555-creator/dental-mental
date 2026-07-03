import { ALL_TEETH } from "@/lib/constants";
import type { ToothRecord, WorkActItem } from "@/lib/types";
import { normalizeTeethRecords, normalizeToothRecord } from "@/lib/tooth-record-utils";

const FDI_SET = new Set<number>(ALL_TEETH);

export function isValidFdiToothNumber(value: number): boolean {
  return Number.isInteger(value) && FDI_SET.has(value);
}

export function formatWorkActItemTreatmentLine(item: WorkActItem): string {
  const qty = Math.max(1, item.quantity || 1);
  const base = qty > 1 ? `${item.serviceName} ×${qty}` : item.serviceName;
  return base.trim();
}

function appendTreatmentLine(existing: string | undefined, line: string): string {
  const prev = existing?.trim();
  if (!prev) return line;
  if (prev.includes(line)) return prev;
  return `${prev}; ${line}`;
}

/** Записывает оказанные услуги по зубам в зубную форму (completedTreatment). */
export function applyWorkActItemsToTeeth(
  teeth: ToothRecord[],
  items: WorkActItem[],
  meta?: { actNumber?: string; actDate?: string }
): ToothRecord[] {
  const withTeeth = items.filter(
    (item) => item.toothNumber != null && isValidFdiToothNumber(item.toothNumber)
  );
  if (withTeeth.length === 0) return teeth;

  const prefix =
    meta?.actNumber && meta?.actDate
      ? `Акт №${meta.actNumber} (${meta.actDate}): `
      : "";

  let next = normalizeTeethRecords(teeth);
  let changed = false;

  for (const item of withTeeth) {
    const toothNumber = item.toothNumber!;
    const line = `${prefix}${formatWorkActItemTreatmentLine(item)}`;
    const existing =
      next.find((t) => t.toothNumber === toothNumber) ??
      ({
        toothNumber,
        condition: "healthy",
        vestibularConditions: ["healthy"],
        lingualConditions: [],
        status: "completed",
      } satisfies ToothRecord);

    const updated: ToothRecord = normalizeToothRecord({
      ...existing,
      completedTreatment: appendTreatmentLine(existing.completedTreatment, line),
      status: "completed",
    });

    const idx = next.findIndex((t) => t.toothNumber === toothNumber);
    if (idx >= 0) {
      const prev = next[idx]!;
      if (
        prev.completedTreatment === updated.completedTreatment &&
        prev.status === updated.status
      ) {
        continue;
      }
      changed = true;
      next = next.map((t, i) => (i === idx ? updated : t));
    } else {
      changed = true;
      next = [...next, updated];
    }
  }

  return changed ? next : teeth;
}
