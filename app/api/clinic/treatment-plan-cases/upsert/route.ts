import {
  handleUpsertTreatmentPlanCase,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";
import type { TreatmentPlanCase } from "@/lib/types";

function isTreatmentPlanCase(value: unknown): value is TreatmentPlanCase {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TreatmentPlanCase>;
  return (
    typeof item.id === "string" &&
    item.id.trim().length > 0 &&
    Array.isArray(item.planIds)
  );
}

/** Command API: сохранить группу планов лечения без полного snapshot PUT. */
export async function POST(request: Request) {
  let body: { case?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  if (!isTreatmentPlanCase(body.case)) {
    return jsonBadRequest("Некорректная группа планов");
  }
  return handleUpsertTreatmentPlanCase(request, body.case);
}
