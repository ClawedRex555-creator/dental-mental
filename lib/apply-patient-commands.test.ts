import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyUpsertPatientToPersistedState } from "./apply-patient-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Patient } from "./types";

function samplePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "p1",
    firstName: "Ирина",
    lastName: "Петрова",
    phone: "+79001112233",
    birthDate: "1990-01-01",
    gender: "female",
    source: "Сайт",
    status: "active",
    disability: "not_specified",
    createdAt: "2026-01-01",
    balance: 0,
    totalSpent: 0,
    ...overrides,
  };
}

describe("apply-patient-commands", () => {
  it("creates a new patient", () => {
    const state = createFreshPersistedState();
    const result = applyUpsertPatientToPersistedState(state, samplePatient());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyApplied, false);
    assert.equal(result.state.patients[0]?.lastName, "Петрова");
  });

  it("updates existing patient name", () => {
    const state = createFreshPersistedState();
    state.patients = [samplePatient()];
    const result = applyUpsertPatientToPersistedState(
      state,
      samplePatient({ firstName: "Анна", lastName: "Сидорова" })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.patients[0]?.firstName, "Анна");
    assert.equal(result.state.patients[0]?.lastName, "Сидорова");
  });

  it("does not wipe server phone with empty client phone", () => {
    const state = createFreshPersistedState();
    state.patients = [samplePatient({ phone: "+79001112233" })];
    const result = applyUpsertPatientToPersistedState(
      state,
      samplePatient({ phone: "", firstName: "Анна" })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.patients[0]?.firstName, "Анна");
    assert.equal(result.state.patients[0]?.phone, "+79001112233");
  });
});
