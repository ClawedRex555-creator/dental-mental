import {
  handleAddPatientNote,
  handleDeletePatientNote,
  jsonBadRequest,
} from "@/lib/clinic-entity-command.server";
import type { PatientNote } from "@/lib/types";

function isPatientNote(value: unknown): value is PatientNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<PatientNote>;
  return typeof note.id === "string" && note.id.trim().length > 0;
}

/** Command API: добавить заметку пациента. */
export async function POST(request: Request) {
  let body: { note?: unknown; noteId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Неверный запрос");
  }

  if (body.action === "delete") {
    const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
    if (!noteId) return jsonBadRequest("Не указана заметка");
    return handleDeletePatientNote(request, noteId);
  }

  if (!isPatientNote(body.note)) {
    return jsonBadRequest("Некорректная заметка");
  }
  return handleAddPatientNote(request, body.note);
}
