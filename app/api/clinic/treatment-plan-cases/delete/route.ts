import {
  handleDeleteTreatmentPlanCase,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";

/** Command API: удалить группу планов (сами планы остаются). */
export async function POST(request: Request) {
  let body: { caseId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  if (typeof body.caseId !== "string" || !body.caseId.trim()) {
    return jsonBadRequest("Не указан кейс");
  }
  return handleDeleteTreatmentPlanCase(request, body.caseId);
}
