import type {
  Cabinet,
  ClinicDocumentTemplate,
  ClinicExpense,
  DoctorMonthSchedule,
  PatientFile,
  ToothRecord,
  WarehouseItem,
} from "@/lib/types";

export type SnapshotCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postSnapshotCommand(
  path: string,
  body: Record<string, unknown>
): Promise<SnapshotCommandResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
      updatedAt?: string | null;
      revision?: number | null;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      updatedAt: json.updatedAt ?? null,
      revision:
        typeof json.revision === "number" && Number.isFinite(json.revision)
          ? json.revision
          : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

export function upsertCabinetViaCommandApi(cabinet: Cabinet) {
  return postSnapshotCommand("/api/clinic/cabinets", {
    action: "upsert",
    cabinet,
  });
}

export function deleteCabinetViaCommandApi(cabinetId: string) {
  return postSnapshotCommand("/api/clinic/cabinets", {
    action: "delete",
    cabinetId,
  });
}

export function assignStaffToCabinetViaCommandApi(cabinetId: string, staffId: string) {
  return postSnapshotCommand("/api/clinic/cabinets", {
    action: "assign_staff",
    cabinetId,
    staffId,
  });
}

export function upsertDoctorScheduleViaCommandApi(schedule: DoctorMonthSchedule) {
  return postSnapshotCommand("/api/clinic/doctor-schedules", { schedule });
}

export function upsertClinicExpenseViaCommandApi(expense: ClinicExpense) {
  return postSnapshotCommand("/api/clinic/expenses", {
    action: "upsert",
    expense,
  });
}

export function deleteClinicExpenseViaCommandApi(expenseId: string) {
  return postSnapshotCommand("/api/clinic/expenses", {
    action: "delete",
    expenseId,
  });
}

export function setAssistantManualHoursViaCommandApi(
  assistantId: string,
  date: string,
  hours: string
) {
  return postSnapshotCommand("/api/clinic/assistant-hours", {
    assistantId,
    date,
    hours,
  });
}

export function upsertPatientFileViaCommandApi(file: PatientFile) {
  return postSnapshotCommand("/api/clinic/patient-files", { file });
}

export function setPatientTeethViaCommandApi(patientId: string, teeth: ToothRecord[]) {
  return postSnapshotCommand("/api/clinic/teeth", { patientId, teeth });
}

export function upsertWarehouseItemViaCommandApi(item: WarehouseItem) {
  return postSnapshotCommand("/api/clinic/warehouse", {
    action: "upsert",
    item,
  });
}

export function deleteWarehouseItemViaCommandApi(itemId: string) {
  return postSnapshotCommand("/api/clinic/warehouse", {
    action: "delete",
    itemId,
  });
}

export function upsertDocumentTemplateViaCommandApi(template: ClinicDocumentTemplate) {
  return postSnapshotCommand("/api/clinic/document-templates", {
    action: "upsert",
    template,
  });
}

export function deleteDocumentTemplateViaCommandApi(templateId: string) {
  return postSnapshotCommand("/api/clinic/document-templates", {
    action: "delete",
    templateId,
  });
}
