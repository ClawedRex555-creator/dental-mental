import type {
  PatientPrepayment,
  PatientPrepaymentItem,
  Payment,
  WorkAct,
} from "@/lib/types";
import { normalizePlanItemQuantity } from "@/lib/treatment-plan-item-utils";
import {
  getWorkActPaidAmount,
  getWorkActRemainingAmount,
  isWorkActFullyPaid,
} from "@/lib/work-act-payment";

/** Источник аванса: документ предоплаты или частично оплаченный акт услуг */
export type OpenPrepaidSource = {
  id: string;
  kind: "document" | "partial_act";
  patientId: string;
  /** Номер акта / документа */
  label: string;
  /** Уже внесённая сумма (кредит / аванс) */
  credit: number;
  /** Сколько ещё доплатить по плану или акту */
  remaining: number;
  serviceNames: string[];
  date: string;
  prepayment?: PatientPrepayment;
  act?: WorkAct;
};

/** Стабильные id позиций для старых документов без id. */
export function withPrepaymentItemIds(
  prepayment: PatientPrepayment
): PatientPrepayment {
  return {
    ...prepayment,
    items: (prepayment.items ?? []).map((it, index) => ({
      ...it,
      id: it.id?.trim() || `${prepayment.id}_item_${index}`,
    })),
  };
}

export function isPrepaymentItemSettled(item: PatientPrepaymentItem): boolean {
  return Boolean(item.settledWorkActId || item.settledAt);
}

export function getUnsettledPrepaymentItems(
  prepayment: PatientPrepayment
): PatientPrepaymentItem[] {
  return withPrepaymentItemIds(prepayment).items.filter(
    (it) => !isPrepaymentItemSettled(it)
  );
}

export function prepaymentItemLineTotal(item: PatientPrepaymentItem): number {
  return Math.max(0, item.price) * normalizePlanItemQuantity(item.quantity);
}

/** Незачтённые документы предоплаты (есть доступный аванс). */
export function getOpenPatientPrepayments(
  prepayments: PatientPrepayment[] | undefined,
  patientId: string
): PatientPrepayment[] {
  if (!patientId) return [];
  return (prepayments ?? []).filter((p) => {
    if (p.patientId !== patientId || p.paidAmount <= 0) return false;
    if (p.settledAt) return false;
    return getPrepaymentAvailableCredit(p) > 0;
  });
}

export function getPrepaymentAvailableCredit(
  prepayment: PatientPrepayment
): number {
  const settled = Math.max(0, prepayment.settledAmount ?? 0);
  return Math.max(0, prepayment.paidAmount - settled);
}

/**
 * Пометить выбранные позиции зачтёнными и обновить settledAmount.
 * settledAt ставится, когда не осталось открытых позиций или аванс исчерпан.
 */
export function settlePrepaymentItems(
  prepayment: PatientPrepayment,
  itemIds: string[],
  workActId: string,
  appliedCredit: number,
  settledAt: string
): PatientPrepayment {
  const idSet = new Set(itemIds.filter(Boolean));
  const withIds = withPrepaymentItemIds(prepayment);
  const items = withIds.items.map((it) =>
    idSet.has(it.id!) && !isPrepaymentItemSettled(it)
      ? { ...it, settledWorkActId: workActId, settledAt }
      : it
  );
  const settledAmount =
    Math.max(0, prepayment.settledAmount ?? 0) + Math.max(0, appliedCredit);
  const availableAfter = Math.max(0, prepayment.paidAmount - settledAmount);
  const hasOpenItems = items.some((it) => !isPrepaymentItemSettled(it));
  const fullySettled = !hasOpenItems || availableAfter <= 0;

  return {
    ...withIds,
    items,
    settledAmount: Math.min(prepayment.paidAmount, settledAmount),
    settledWorkActId: workActId,
    ...(fullySettled ? { settledAt } : { settledAt: undefined }),
  };
}

/** Акт услуг с частичной оплатой = предоплата (в т.ч. старые акты) */
export function isPartialServiceActAsPrepayment(
  act: WorkAct,
  payments: Payment[]
): boolean {
  if (act.actType === "prepayment") return false;
  if (isWorkActFullyPaid(act, payments)) return false;
  const paid = getWorkActPaidAmount(payments, act.id);
  return paid > 0 && getWorkActRemainingAmount(act, payments) > 0;
}

export function getPartialActsAsPrepayments(
  workActs: WorkAct[] | undefined,
  payments: Payment[],
  patientId: string
): WorkAct[] {
  if (!patientId) return [];
  return (workActs ?? [])
    .filter(
      (a) =>
        a.patientId === patientId && isPartialServiceActAsPrepayment(a, payments)
    )
    .sort((a, b) => b.actDate.localeCompare(a.actDate));
}

/**
 * Все открытые «предоплаты» пациента:
 * — документы аванса (PatientPrepayment);
 * — частично оплаченные акты услуг (старые и новые).
 */
export function getOpenPrepaidSources(
  prepayments: PatientPrepayment[] | undefined,
  workActs: WorkAct[] | undefined,
  payments: Payment[],
  patientId: string
): OpenPrepaidSource[] {
  if (!patientId) return [];

  const acts = workActs ?? [];
  const prepDocs = getOpenPatientPrepayments(prepayments, patientId);
  /** Не дублировать акт, уже связанный с открытым документом предоплаты */
  const linkedActIds = new Set(
    prepDocs.map((p) => p.workActId).filter((id): id is string => Boolean(id))
  );

  const fromDocs: OpenPrepaidSource[] = prepDocs.map((p) => {
    const openItems = getUnsettledPrepaymentItems(p);
    return {
      id: `prep:${p.id}`,
      kind: "document" as const,
      patientId: p.patientId,
      label: p.actNumber ? `№ ${p.actNumber}` : "Предоплата",
      credit: getPrepaymentAvailableCredit(p),
      remaining: Math.max(0, p.remainingAmount ?? 0),
      serviceNames: openItems.map((i) => i.serviceName).filter(Boolean),
      date: p.date,
      prepayment: p,
      act: p.workActId ? acts.find((a) => a.id === p.workActId) : undefined,
    };
  });

  const fromPartialActs: OpenPrepaidSource[] = getPartialActsAsPrepayments(
    acts,
    payments,
    patientId
  )
    .filter((a) => !linkedActIds.has(a.id))
    .map((a) => {
      const credit = getWorkActPaidAmount(payments, a.id);
      const remaining = getWorkActRemainingAmount(a, payments);
      return {
        id: `act:${a.id}`,
        kind: "partial_act" as const,
        patientId: a.patientId,
        label: `Акт № ${a.actNumber}`,
        credit,
        remaining,
        serviceNames: (a.items ?? []).map((i) => i.serviceName).filter(Boolean),
        date: a.actDate,
        act: a,
      };
    });

  return [...fromDocs, ...fromPartialActs].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}
