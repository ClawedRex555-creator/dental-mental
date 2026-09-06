import {
  handleDeletePrepayment,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";

/** Command API: удалить документ предоплаты (и связанный неоплаченный акт-аванс). */
export async function POST(request: Request) {
  let body: { prepaymentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  const prepaymentId =
    typeof body.prepaymentId === "string" ? body.prepaymentId.trim() : "";
  if (!prepaymentId) return jsonBadRequest("Не указана предоплата");
  return handleDeletePrepayment(request, prepaymentId);
}
