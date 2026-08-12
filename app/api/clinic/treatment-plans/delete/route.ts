import {
  handleDeleteTreatmentPlan,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";

/** Command API: удалить план лечения. */
export async function POST(request: Request) {
  let body: { planId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  const planId = typeof body.planId === "string" ? body.planId.trim() : "";
  if (!planId) return jsonBadRequest("Не указан план");
  return handleDeleteTreatmentPlan(request, planId);
}
