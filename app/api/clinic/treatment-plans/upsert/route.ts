import { NextResponse } from "next/server";
import {
  handleUpsertTreatmentPlan,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";
import type { TreatmentPlan } from "@/lib/types";

function isTreatmentPlan(value: unknown): value is TreatmentPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<TreatmentPlan>;
  return typeof plan.id === "string" && plan.id.trim().length > 0;
}

/** Command API: сохранить план лечения без полного snapshot PUT. */
export async function POST(request: Request) {
  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  if (!isTreatmentPlan(body.plan)) {
    return jsonBadRequest("Некорректный план лечения");
  }
  return handleUpsertTreatmentPlan(request, body.plan);
}
