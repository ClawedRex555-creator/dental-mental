import type { DiscountType, Payment, TreatmentPlanItem, WorkAct } from "./types";
import { calcDiscountTotals } from "./discount-utils";
import { planItemLineTotal, planItemStageKey } from "./treatment-plan-item-utils";
import { getWorkActPaidAmount } from "./work-act-payment";

export function isPlanItemOpen(item: TreatmentPlanItem): boolean {
  return item.status !== "completed" && item.status !== "cancelled";
}

export function calcPlanTotals(
  items: TreatmentPlanItem[],
  discountType: DiscountType,
  discount: number
) {
  const totalAmount = items.reduce((s, it) => s + planItemLineTotal(it), 0);
  const { totalAmount: finalAmount, discountValue } = calcDiscountTotals(
    totalAmount,
    discountType,
    discount
  );
  return { totalAmount, finalAmount, discountValue };
}

/**
 * Остаток по плану: сумма незавершённых позиций + скидка пропорционально
 * openSubtotal / totalAmount.
 */
export function calcPlanRemaining(
  items: TreatmentPlanItem[],
  discountType: DiscountType,
  discount: number
) {
  const openItems = items.filter(isPlanItemOpen);
  const completedItems = items.filter((it) => it.status === "completed");
  const { totalAmount, finalAmount, discountValue } = calcPlanTotals(
    items,
    discountType,
    discount
  );
  const openSubtotal = openItems.reduce((s, it) => s + planItemLineTotal(it), 0);
  const completedSubtotal = completedItems.reduce(
    (s, it) => s + planItemLineTotal(it),
    0
  );

  if (totalAmount <= 0) {
    return {
      totalAmount,
      finalAmount,
      discountValue,
      openSubtotal: 0,
      completedSubtotal,
      remainingAmount: 0,
    };
  }

  const ratio = openSubtotal / totalAmount;
  const remainingAmount = Math.round(finalAmount * ratio * 100) / 100;

  return {
    totalAmount,
    finalAmount,
    discountValue,
    openSubtotal,
    completedSubtotal,
    remainingAmount,
  };
}

export type PlanItemStageGroup = {
  stage: string;
  items: TreatmentPlanItem[];
  subtotal: number;
  /** Общий врач темы, если у всех позиций один (или единственный заданный) */
  doctorId?: string;
};

export type PlanItemStageRun = {
  stage: string;
  items: TreatmentPlanItem[];
};

/** Блоки тем в порядке массива (новая услуга сверху — сразу под поиском). */
export function groupPlanItemsInArrayOrder(
  items: TreatmentPlanItem[]
): PlanItemStageRun[] {
  const runs: PlanItemStageRun[] = [];
  for (const item of items) {
    const stage = planItemStageKey(item.stage);
    const last = runs[runs.length - 1];
    if (last?.stage === stage) {
      last.items.push(item);
    } else {
      runs.push({ stage, items: [item] });
    }
  }
  return runs;
}

/** Группировка позиций по теме (stage), порядок — первое появление. */
export function groupPlanItemsByStage(
  items: TreatmentPlanItem[]
): PlanItemStageGroup[] {
  const order: string[] = [];
  const map = new Map<string, TreatmentPlanItem[]>();
  for (const item of items) {
    const stage = planItemStageKey(item.stage);
    if (!map.has(stage)) {
      map.set(stage, []);
      order.push(stage);
    }
    map.get(stage)!.push(item);
  }
  return order.map((stage) => {
    const groupItems = map.get(stage) ?? [];
    const doctorIds = [
      ...new Set(
        groupItems
          .map((it) => it.doctorId?.trim())
          .filter((id): id is string => Boolean(id))
      ),
    ];
    return {
      stage,
      items: groupItems,
      subtotal: groupItems.reduce((s, it) => s + planItemLineTotal(it), 0),
      doctorId: doctorIds.length === 1 ? doctorIds[0] : undefined,
    };
  });
}

/** Активная тема — первой в списке (новые услуги видны сразу под поиском). */
export function prioritizePlanStageGroups(
  groups: PlanItemStageGroup[],
  priorityStage?: string | null
): PlanItemStageGroup[] {
  if (!priorityStage) return groups;
  const key = priorityStage.trim() || "Без категории";
  const idx = groups.findIndex((g) => g.stage === key);
  if (idx <= 0) return groups;
  return [groups[idx]!, ...groups.slice(0, idx), ...groups.slice(idx + 1)];
}

/** Врач для акта/записи: единый у выбранных позиций, иначе врач плана. */
export function resolvePlanItemsDoctorId(
  items: TreatmentPlanItem[],
  fallbackDoctorId: string
): string {
  const ids = [
    ...new Set(
      items
        .map((it) => it.doctorId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 1) return ids[0]!;
  return fallbackDoctorId;
}

/**
 * Оплаты по актам, привязанным к позициям плана (completedWorkActId).
 * paidAmount / unpaidAmount — по этим актам; remainingWork — незавершённые позиции.
 */
export function calcPlanLinkedPaymentSummary(
  items: TreatmentPlanItem[],
  workActs: WorkAct[],
  payments: Payment[],
  discountType: DiscountType,
  discount: number
) {
  const remaining = calcPlanRemaining(items, discountType, discount);
  const actIds = [
    ...new Set(
      items
        .map((it) => it.completedWorkActId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const byId = new Map(workActs.map((a) => [a.id, a]));
    let billedAmount = 0;
  let paidAmount = 0;
  for (const id of actIds) {
    const act = byId.get(id);
    if (!act || act.actType === "prepayment") continue;
    billedAmount += act.totalAmount;
    const fromPayments = getWorkActPaidAmount(payments, id);
    if (fromPayments > 0) {
      paidAmount += fromPayments;
    } else if (act.paymentStatus === "paid") {
      paidAmount += act.totalAmount;
    }
  }
  paidAmount = Math.min(paidAmount, billedAmount);
  const unpaidAmount = Math.max(0, billedAmount - paidAmount);
  return {
    ...remaining,
    billedAmount,
    paidAmount,
    unpaidAmount,
  };
}
