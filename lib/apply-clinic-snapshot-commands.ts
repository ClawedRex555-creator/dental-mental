import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type {
  Cabinet,
  ClinicDocumentTemplate,
  ClinicExpense,
  Doctor,
  DoctorMonthSchedule,
  PatientFile,
  ToothRecord,
  WarehouseItem,
} from "@/lib/types";

export type ApplySnapshotCommandResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      entityId: string;
      alreadyApplied: boolean;
    };

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  const exists = rows.some((item) => item.id === row.id);
  if (!exists) return [row, ...rows];
  return rows.map((item) => (item.id === row.id ? row : item));
}

export function applyUpsertDoctorToPersistedState(
  state: ClinicPersistedState,
  doctor: Doctor
): ApplySnapshotCommandResult {
  const id = doctor.id?.trim();
  if (!id) return { ok: false, error: "Не указан сотрудник" };
  const normalized = { ...doctor, id };
  const existing = state.doctors.find((row) => row.id === id);
  const tombstoned = (state.deletedDoctorIds ?? []).includes(id);
  if (existing && sameJson(existing, normalized) && !tombstoned) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      doctors: upsertById(state.doctors, normalized),
      deletedDoctorIds: (state.deletedDoctorIds ?? []).filter((rowId) => rowId !== id),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyUpsertCabinetToPersistedState(
  state: ClinicPersistedState,
  cabinet: Cabinet
): ApplySnapshotCommandResult {
  const id = cabinet.id?.trim();
  if (!id) return { ok: false, error: "Не указан кабинет" };
  const normalized: Cabinet = {
    ...cabinet,
    id,
    staffIds: [...new Set(cabinet.staffIds ?? [])],
  };
  const existing = state.cabinets.find((row) => row.id === id);
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      cabinets: upsertById(state.cabinets, normalized),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyDeleteCabinetToPersistedState(
  state: ClinicPersistedState,
  cabinetId: string
): ApplySnapshotCommandResult {
  const id = cabinetId?.trim();
  if (!id) return { ok: false, error: "Не указан кабинет" };
  const exists = state.cabinets.some((row) => row.id === id);
  const doctorsChanged = state.doctors.some((doctor) => doctor.cabinetId === id);
  const appointmentsChanged = state.appointments.some((apt) => apt.cabinetId === id);
  if (!exists && !doctorsChanged && !appointmentsChanged) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      cabinets: state.cabinets.filter((row) => row.id !== id),
      doctors: state.doctors.map((doctor) =>
        doctor.cabinetId === id ? { ...doctor, cabinetId: undefined, cabinet: "—" } : doctor
      ),
      appointments: state.appointments.map((apt) =>
        apt.cabinetId === id ? { ...apt, cabinetId: undefined } : apt
      ),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyAssignStaffToCabinetToPersistedState(
  state: ClinicPersistedState,
  cabinetId: string,
  staffId: string
): ApplySnapshotCommandResult {
  const cabId = cabinetId?.trim();
  const docId = staffId?.trim();
  if (!cabId || !docId) return { ok: false, error: "Не указан кабинет или сотрудник" };
  const targetCabinet = state.cabinets.find((row) => row.id === cabId);
  if (!targetCabinet) return { ok: false, error: "Кабинет не найден" };
  const doctor = state.doctors.find((row) => row.id === docId);
  if (!doctor) return { ok: false, error: "Сотрудник не найден" };

  const alreadyAssigned =
    doctor.cabinetId === cabId &&
    state.cabinets.some((row) => row.id === cabId && (row.staffIds ?? []).includes(docId));
  if (alreadyAssigned) {
    return { ok: true, state, entityId: `${cabId}:${docId}`, alreadyApplied: true };
  }

  return {
    ok: true,
    state: {
      ...state,
      cabinets: state.cabinets.map((cabinet) => {
        const currentIds = (cabinet.staffIds ?? []).filter((id) => id !== docId);
        if (cabinet.id !== cabId) {
          return { ...cabinet, staffIds: currentIds };
        }
        return { ...cabinet, staffIds: [...new Set([...currentIds, docId])] };
      }),
      doctors: state.doctors.map((row) =>
        row.id === docId ? { ...row, cabinetId: cabId, cabinet: targetCabinet.name } : row
      ),
    },
    entityId: `${cabId}:${docId}`,
    alreadyApplied: false,
  };
}

export function applyUpsertDoctorScheduleToPersistedState(
  state: ClinicPersistedState,
  schedule: DoctorMonthSchedule
): ApplySnapshotCommandResult {
  const doctorId = schedule.doctorId?.trim();
  const month = schedule.month?.trim();
  if (!doctorId || !month) return { ok: false, error: "Некорректный график" };
  const normalized: DoctorMonthSchedule = {
    ...schedule,
    doctorId,
    month,
    updatedAt: schedule.updatedAt?.trim() || new Date().toISOString(),
  };
  const key = `${doctorId}:${month}`;
  const existing = (state.doctorSchedules ?? []).find(
    (row) => row.doctorId === doctorId && row.month === month
  );
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: key, alreadyApplied: true };
  }
  const rest = (state.doctorSchedules ?? []).filter(
    (row) => !(row.doctorId === doctorId && row.month === month)
  );
  return {
    ok: true,
    state: {
      ...state,
      doctorSchedules: [normalized, ...rest],
    },
    entityId: key,
    alreadyApplied: false,
  };
}

export function applyUpsertClinicExpenseToPersistedState(
  state: ClinicPersistedState,
  expense: ClinicExpense
): ApplySnapshotCommandResult {
  const id = expense.id?.trim();
  if (!id) return { ok: false, error: "Не указан расход" };
  const normalized = { ...expense, id };
  const existing = state.clinicExpenses.find((row) => row.id === id);
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      clinicExpenses: upsertById(state.clinicExpenses, normalized),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyDeleteClinicExpenseToPersistedState(
  state: ClinicPersistedState,
  expenseId: string
): ApplySnapshotCommandResult {
  const id = expenseId?.trim();
  if (!id) return { ok: false, error: "Не указан расход" };
  if (!state.clinicExpenses.some((row) => row.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      clinicExpenses: state.clinicExpenses.filter((row) => row.id !== id),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applySetAssistantManualHoursToPersistedState(
  state: ClinicPersistedState,
  input: { assistantId: string; date: string; hours: string }
): ApplySnapshotCommandResult {
  const assistantId = input.assistantId?.trim();
  const date = input.date?.trim();
  if (!assistantId || !date) return { ok: false, error: "Некорректные данные смены" };
  const hours = input.hours.trim();
  const next = { ...(state.assistantManualHours ?? {}) };
  const dayMap = { ...(next[assistantId] ?? {}) };
  if (hours) dayMap[date] = hours;
  else delete dayMap[date];
  if (Object.keys(dayMap).length === 0) delete next[assistantId];
  else next[assistantId] = dayMap;

  if (sameJson(state.assistantManualHours ?? {}, next)) {
    return {
      ok: true,
      state,
      entityId: `${assistantId}:${date}`,
      alreadyApplied: true,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      assistantManualHours: next,
    },
    entityId: `${assistantId}:${date}`,
    alreadyApplied: false,
  };
}

export function applyUpsertPatientFileToPersistedState(
  state: ClinicPersistedState,
  file: PatientFile
): ApplySnapshotCommandResult {
  const id = file.id?.trim();
  if (!id) return { ok: false, error: "Не указан файл пациента" };
  const normalized = { ...file, id };
  const existing = state.patientFiles.find((row) => row.id === id);
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      patientFiles: upsertById(state.patientFiles, normalized),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applySetPatientTeethToPersistedState(
  state: ClinicPersistedState,
  input: { patientId: string; teeth: ToothRecord[] }
): ApplySnapshotCommandResult {
  const patientId = input.patientId?.trim();
  if (!patientId) return { ok: false, error: "Не указан пациент" };
  const current = state.teethByPatient[patientId] ?? [];
  if (sameJson(current, input.teeth)) {
    return { ok: true, state, entityId: patientId, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      teethByPatient: {
        ...state.teethByPatient,
        [patientId]: input.teeth,
      },
    },
    entityId: patientId,
    alreadyApplied: false,
  };
}

export function applyUpsertWarehouseItemToPersistedState(
  state: ClinicPersistedState,
  item: WarehouseItem
): ApplySnapshotCommandResult {
  const id = item.id?.trim();
  if (!id) return { ok: false, error: "Не указан складской остаток" };
  const normalized = { ...item, id };
  const existing = state.warehouse.find((row) => row.id === id);
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      warehouse: upsertById(state.warehouse, normalized),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyDeleteWarehouseItemToPersistedState(
  state: ClinicPersistedState,
  itemId: string
): ApplySnapshotCommandResult {
  const id = itemId?.trim();
  if (!id) return { ok: false, error: "Не указан складской остаток" };
  if (!state.warehouse.some((row) => row.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      warehouse: state.warehouse.filter((row) => row.id !== id),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyUpsertDocumentTemplateToPersistedState(
  state: ClinicPersistedState,
  template: ClinicDocumentTemplate
): ApplySnapshotCommandResult {
  const id = template.id?.trim();
  if (!id) return { ok: false, error: "Не указан шаблон" };
  const normalized = { ...template, id };
  const existing = state.documentTemplates.find((row) => row.id === id);
  if (existing && sameJson(existing, normalized)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      documentTemplates: upsertById(state.documentTemplates, normalized),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export function applyDeleteDocumentTemplateToPersistedState(
  state: ClinicPersistedState,
  templateId: string
): ApplySnapshotCommandResult {
  const id = templateId?.trim();
  if (!id) return { ok: false, error: "Не указан шаблон" };
  if (!state.documentTemplates.some((row) => row.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      documentTemplates: state.documentTemplates.filter((row) => row.id !== id),
    },
    entityId: id,
    alreadyApplied: false,
  };
}
