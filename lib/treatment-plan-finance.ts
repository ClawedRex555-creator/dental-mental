import { format } from "date-fns";
import type { TreatmentPlan, WorkAct, WorkActItem } from "@/lib/types";
import { createInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import {
  normalizePlanItemQuantity,
  planItemLineTotal,
} from "@/lib/treatment-plan-item-utils";
import { generateId } from "@/lib/utils";

export function buildWorkActFromTreatmentPlan(
  plan: TreatmentPlan,
  actNumber: string
) {
  const actId = generateId("act");
  const invoiceId = generateId("inv");
  const actDate = format(new Date(), "yyyy-MM-dd");

  const items: WorkActItem[] = plan.items.map((item) => {
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

  const act: WorkAct = {
    id: actId,
    actNumber,
    actDate,
    patientId: plan.patientId,
    doctorId: plan.doctorId,
    medicalRecordId: plan.medicalRecordId,
    items,
    subtotalAmount: plan.totalAmount,
    discountType: plan.discountType ?? "percent",
    discount: plan.discount ?? 0,
    totalAmount: plan.finalAmount,
    paymentStatus: "pending",
    invoiceId,
    createdAt: actDate,
    actType: "services",
    notes: `Оплата плана лечения «${plan.title}»`,
  };

  const invoice = createInvoiceFromWorkAct(act, invoiceId);

  return { act, invoice };
}
