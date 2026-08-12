import {
  handleCreatePrepayment,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";
import type { PatientPrepayment, WorkAct } from "@/lib/types";

function isPrepayment(value: unknown): value is PatientPrepayment {
  if (!value || typeof value !== "object") return false;
  const prep = value as Partial<PatientPrepayment>;
  return typeof prep.id === "string" && prep.id.trim().length > 0;
}

function isWorkAct(value: unknown): value is WorkAct {
  if (!value || typeof value !== "object") return false;
  const act = value as Partial<WorkAct>;
  return typeof act.id === "string" && act.id.trim().length > 0;
}

/** Command API: создать предоплату + акт-аванс без полного PUT. */
export async function POST(request: Request) {
  let body: { prepayment?: unknown; workAct?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  if (!isPrepayment(body.prepayment) || !isWorkAct(body.workAct)) {
    return jsonBadRequest("Некорректные данные предоплаты");
  }
  return handleCreatePrepayment(request, {
    prepayment: body.prepayment,
    workAct: body.workAct,
  });
}
