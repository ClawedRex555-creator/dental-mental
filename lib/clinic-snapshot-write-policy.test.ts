import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import {
  enforceClinicSnapshotWritePolicy,
  filterClinicSnapshotForDoctor,
} from "./clinic-snapshot-write-policy";

describe("clinic-snapshot-write-policy", () => {
  it("rejects new patient tombstones for doctor", () => {
    const existing = createFreshPersistedState();
    existing.patients = [
      {
        id: "p1",
        firstName: "A",
        lastName: "B",
        phone: "+79001112233",
        birthDate: "1990-01-01",
        gender: "male",
        source: "Сайт",
        status: "active",
        disability: "not_specified",
        createdAt: "2026-01-01",
        balance: 0,
        totalSpent: 0,
      },
    ];
    const incoming = {
      ...existing,
      patients: [],
      deletedPatientIds: ["p1"],
    };
    const result = enforceClinicSnapshotWritePolicy("doctor", existing, incoming);
    assert.equal(result.ok, false);
  });

  it("allows owner patient tombstones", () => {
    const existing = createFreshPersistedState();
    const incoming = {
      ...existing,
      deletedPatientIds: ["p1"],
    };
    const result = enforceClinicSnapshotWritePolicy("owner", existing, incoming);
    assert.equal(result.ok, true);
  });

  it("strips phone for doctor filter helper (not used on sync GET)", () => {
    const state = createFreshPersistedState();
    state.patients = [
      {
        id: "p1",
        firstName: "A",
        lastName: "B",
        phone: "+79001112233",
        snils: "123",
        birthDate: "1990-01-01",
        gender: "male",
        source: "Сайт",
        status: "active",
        disability: "not_specified",
        createdAt: "2026-01-01",
        balance: 0,
        totalSpent: 0,
      },
    ];
    const filtered = filterClinicSnapshotForDoctor(state);
    assert.equal(filtered.patients[0]?.phone, "");
    assert.equal(filtered.patients[0]?.snils, undefined);
  });
});
