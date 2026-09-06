import {
  handleSettlePrepayment,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";

/** Command API: зачесть выбранные услуги предоплаты в акт оказанных. */
export async function POST(request: Request) {
  let body: {
    prepaymentId?: unknown;
    workActId?: unknown;
    itemIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  const prepaymentId =
    typeof body.prepaymentId === "string" ? body.prepaymentId.trim() : "";
  const workActId =
    typeof body.workActId === "string" ? body.workActId.trim() : "";
  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (!prepaymentId || !workActId) {
    return jsonBadRequest("Не указаны предоплата или акт");
  }
  if (itemIds.length === 0) {
    return jsonBadRequest("Выберите услуги для зачёта");
  }
  return handleSettlePrepayment(request, { prepaymentId, workActId, itemIds });
}
