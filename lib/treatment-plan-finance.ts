import { format } from "date-fns";
import type { TreatmentPlan, TreatmentPlanItem, WorkAct, WorkActItem } from "@/lib/types";
import { createInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import {
  normalizePlanItemQuantity,
  planItemLineTotal,
} from "@/lib/treatment-plan-item-utils";
import {
  calcPlanTotals,
  resolvePlanItemsDoctorId,
} from "@/lib/treatment-plan-utils";
import { generateId } from "@/lib/utils";

export function buildWorkActFromTreatmentPlan(
  plan: TreatmentPlan,
  actNumber: string
) {
  return buildWorkActFromTreatmentPlanItems(
    plan,
    plan.items.map((i) => i.id),
    actNumber
  );
}

/** Акт из выбранных позиций плана (для частичного выполнения). */
export function buildWorkActFromTreatmentPlanItems(
  plan: TreatmentPlan,
  itemIds: string[],
  actNumber: string
) {
  const idSet = new Set(itemIds);
  const selected = plan.items.filter((i) => idSet.has(i.id));
  const actId = generateId("act");
  const invoiceId = generateId("inv");
  const actDate = format(new Date(), "yyyy-MM-dd");

  const items: WorkActItem[] = selected.map((item) => {
    const quantity = normalizePlanItemQuantity(item.quantity);
    return {
      id: generateId("wai"),
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      toothNumber: item.toothNumber,
      quantity,
      price: item.price,
      total: planItemLineTotal(item),
    };
  });

  const usePlanDiscount = selected.length === plan.items.length;
  const { totalAmount, finalAmount } = calcPlanTotals(
    selected,
    plan.discountType ?? "percent",
    usePlanDiscount ? plan.discount ?? 0 : 0
  );

  const act: WorkAct = {
    id: actId,
    actNumber,
    actDate,
    patientId: plan.patientId,
    doctorId: resolvePlanItemsDoctorId(selected, plan.doctorId),
    medicalRecordId: plan.medicalRecordId,
    items,
    subtotalAmount: totalAmount,
    discountType: plan.discountType ?? "percent",
    discount: usePlanDiscount ? plan.discount ?? 0 : 0,
    totalAmount: finalAmount,
    paymentStatus: "pending",
    invoiceId,
    createdAt: actDate,
    actType: "services",
    notes: `По плану лечения «${plan.title}»`,
  };

  const invoice = createInvoiceFromWorkAct(act, invoiceId);

  return { act, invoice, selectedItems: selected as TreatmentPlanItem[] };
}

/** Пометить позиции плана выполненными и привязать акт. */
export function markPlanItemsCompleted(
  items: TreatmentPlanItem[],
  itemIds: string[],
  workActId: string,
  completedAt = format(new Date(), "yyyy-MM-dd")
): TreatmentPlanItem[] {
  const idSet = new Set(itemIds);
  return items.map((item) =>
    idSet.has(item.id)
      ? {
          ...item,
          status: "completed" as const,
          completedWorkActId: workActId,
          completedAt,
        }
      : item
  );
}
