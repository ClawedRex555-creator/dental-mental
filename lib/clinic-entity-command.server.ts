import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { ApplyAppointmentResult } from "@/lib/apply-appointment-commands";
import {
  applyAddPatientNoteToPersistedState,
  applyCreatePrepaymentToPersistedState,
  applyDeletePatientNoteToPersistedState,
  applyDeleteTreatmentPlanToPersistedState,
  applyUpsertMedicalRecordToPersistedState,
  applyUpsertTreatmentPlanToPersistedState,
  type CreatePrepaymentCommandInput,
} from "@/lib/apply-entity-commands";
import {
  APPOINTMENT_CMD_HEADERS,
  requireAppointmentCommandSession,
  saveAppointmentCommandResult,
} from "@/lib/clinic-appointment-command.server";
import { NextResponse } from "next/server";
import type {
  MedicalRecord,
  PatientNote,
  TreatmentPlan,
} from "@/lib/types";

function asApplyAppointment(
  result: ReturnType<typeof applyUpsertTreatmentPlanToPersistedState>
): ApplyAppointmentResult {
  if (!result.ok) return result;
  return {
    ok: true,
    state: result.state,
    appointmentId: result.entityId,
    alreadyApplied: result.alreadyApplied,
  };
}

export async function runEntityCommand(
  request: Request,
  apply: (state: ClinicPersistedState) => ApplyAppointmentResult
): Promise<NextResponse> {
  const auth = await requireAppointmentCommandSession(request);
  if (!auth.ok) return auth.response;
  return saveAppointmentCommandResult(auth.clinicId, apply);
}

export function jsonBadRequest(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 400, headers: APPOINTMENT_CMD_HEADERS }
  );
}

export async function handleUpsertTreatmentPlan(
  request: Request,
  plan: TreatmentPlan
) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyUpsertTreatmentPlanToPersistedState(state, plan))
  );
}

export async function handleDeleteTreatmentPlan(request: Request, planId: string) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyDeleteTreatmentPlanToPersistedState(state, planId))
  );
}

export async function handleUpsertMedicalRecord(
  request: Request,
  record: MedicalRecord
) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyUpsertMedicalRecordToPersistedState(state, record))
  );
}

export async function handleAddPatientNote(request: Request, note: PatientNote) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyAddPatientNoteToPersistedState(state, note))
  );
}

export async function handleDeletePatientNote(request: Request, noteId: string) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyDeletePatientNoteToPersistedState(state, noteId))
  );
}

export async function handleCreatePrepayment(
  request: Request,
  input: CreatePrepaymentCommandInput
) {
  return runEntityCommand(request, (state) =>
    asApplyAppointment(applyCreatePrepaymentToPersistedState(state, input))
  );
}
