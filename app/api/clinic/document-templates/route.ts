import { NextResponse } from "next/server";
import {
  applyDeleteDocumentTemplateToPersistedState,
  applyUpsertDocumentTemplateToPersistedState,
} from "@/lib/apply-clinic-snapshot-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import type { ClinicDocumentTemplate } from "@/lib/types";

type TemplatesAction = "upsert" | "delete";

function parseTemplate(raw: unknown): ClinicDocumentTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (
    row.category !== "contract" &&
    row.category !== "consent" &&
    row.category !== "egisz_refusal"
  ) {
    return null;
  }
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    category: row.category,
    distribution:
      typeof row.distribution === "string" && row.distribution.trim()
        ? row.distribution.trim()
        : undefined,
    fileDataUrl:
      typeof row.fileDataUrl === "string" && row.fileDataUrl.length > 0
        ? row.fileDataUrl
        : undefined,
    fileName:
      typeof row.fileName === "string" && row.fileName.trim() ? row.fileName.trim() : undefined,
  };
}

export async function POST(request: Request) {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role === "partner") {
    return NextResponse.json(
      { ok: false, error: "Нет прав на изменение шаблонов" },
      { status: 403, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  const action = body.action;
  if (action !== "upsert" && action !== "delete") {
    return NextResponse.json(
      { ok: false, error: "Неизвестная команда шаблонов" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  if ((action as TemplatesAction) === "upsert") {
    const template = parseTemplate(body.template);
    if (!template) {
      return NextResponse.json(
        { ok: false, error: "Некорректные данные шаблона" },
        { status: 400, headers: APPOINTMENT_CMD_HEADERS }
      );
    }
    return saveAppointmentCommandResult(auth.clinicId, (state) => {
      const applied = applyUpsertDocumentTemplateToPersistedState(state, template);
      if (!applied.ok) return applied;
      return {
        ok: true,
        state: applied.state,
        appointmentId: applied.entityId,
        alreadyApplied: applied.alreadyApplied,
      };
    });
  }

  const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
  if (!templateId) {
    return NextResponse.json(
      { ok: false, error: "Не указан шаблон" },
      { status: 400, headers: APPOINTMENT_CMD_HEADERS }
    );
  }

  return saveAppointmentCommandResult(auth.clinicId, (state) => {
    const applied = applyDeleteDocumentTemplateToPersistedState(state, templateId);
    if (!applied.ok) return applied;
    return {
      ok: true,
      state: applied.state,
      appointmentId: applied.entityId,
      alreadyApplied: applied.alreadyApplied,
    };
  });
}
