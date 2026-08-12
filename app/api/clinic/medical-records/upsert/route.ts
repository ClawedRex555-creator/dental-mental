import { jsonBadRequest, handleUpsertMedicalRecord } from "@/lib/clinic-entity-command.server";
import type { MedicalRecord } from "@/lib/types";

function isMedicalRecord(value: unknown): value is MedicalRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MedicalRecord>;
  return typeof record.id === "string" && record.id.trim().length > 0;
}

/** Command API: сохранить запись медкарты. */
export async function POST(request: Request) {
  let body: { record?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }
  if (!isMedicalRecord(body.record)) {
    return jsonBadRequest("Некорректная запись медкарты");
  }
  return handleUpsertMedicalRecord(request, body.record);
}
