import type { TreatmentPlanItem } from "./types";
import { normalizeServiceCategory } from "./service-categories";

export function planItemStageKey(stage?: string): string {
  const trimmed = (stage ?? "").trim();
  if (!trimmed) return "Без категории";
  return normalizeServiceCategory(trimmed);
}

/** Новая позиция — самой первой в плане (блок темы поднимается под поиск). */
export function prependPlanItem(
  items: TreatmentPlanItem[],
  item: TreatmentPlanItem
): TreatmentPlanItem[] {
  return [item, ...items];
}

export function movePlanItemToGlobalTop(
  items: TreatmentPlanItem[],
  itemId: string
): TreatmentPlanItem[] {
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx <= 0) return items;
  const item = items[idx]!;
  return [item, ...items.filter((it) => it.id !== itemId)];
}

/** @deprecated Используйте prependPlanItem — вставка в тему не поднимает блок в UI */
export function insertPlanItemAtStageTop(
  items: TreatmentPlanItem[],
  item: TreatmentPlanItem
): TreatmentPlanItem[] {
  const key = planItemStageKey(item.stage);
  const idx = items.findIndex((it) => planItemStageKey(it.stage) === key);
  if (idx < 0) return [item, ...items];
  return [...items.slice(0, idx), item, ...items.slice(idx)];
}

export function movePlanItemToStageTop(
  items: TreatmentPlanItem[],
  itemId: string
): TreatmentPlanItem[] {
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx < 0) return items;
  const item = items[idx]!;
  const rest = items.filter((it) => it.id !== itemId);
  return insertPlanItemAtStageTop(rest, item);
}

export function normalizePlanItemQuantity(quantity?: number): number {
  if (!quantity || !Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.floor(quantity);
}

export function planItemLineTotal(item: TreatmentPlanItem): number {
  return item.price * normalizePlanItemQuantity(item.quantity);
}

export function findMatchingPlanItemIndex(
  items: TreatmentPlanItem[],
  serviceId: string,
  toothNumber?: number
): number {
  return items.findIndex(
    (it) =>
      it.serviceId === serviceId &&
      (toothNumber == null ? it.toothNumber == null : it.toothNumber === toothNumber)
  );
}
