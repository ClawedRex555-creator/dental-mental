import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Patient } from "./types.ts";
import { findDuplicatePatient } from "./patient-duplicate.ts";

function basePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "pat-1",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "+79991234567",
    birthDate: "1990-01-01",
    gender: "male",
    source: "Google",
    status: "active",
    createdAt: "2024-01-01",
    balance: 0,
    totalSpent: 0,
    disability: "none",
    ...overrides,
  };
}

describe("findDuplicatePatient", () => {
  it("detects duplicate phone", () => {
    const existing = basePatient();
    const match = findDuplicatePatient(
      [existing],
      {
        phone: "8 (999) 123-45-67",
        firstName: "Пётр",
        lastName: "Петров",
        birthDate: "1985-05-05",
      }
    );
    assert.equal(match?.patient.id, "pat-1");
    assert.equal(match?.reason, "phone");
  });

  it("detects duplicate identity", () => {
    const existing = basePatient({ middleName: "Иванович" });
    const match = findDuplicatePatient(
      [existing],
      {
        phone: "+79990000000",
        firstName: "Иван",
        lastName: "Иванов",
        middleName: "Иванович",
        birthDate: "1990-01-01",
      }
    );
    assert.equal(match?.reason, "identity");
  });

  it("excludes current patient when editing", () => {
    const existing = basePatient();
    const match = findDuplicatePatient(
      [existing],
      {
        phone: "+79991234567",
        firstName: "Иван",
        lastName: "Иванов",
        birthDate: "1990-01-01",
      },
      "pat-1"
    );
    assert.equal(match, null);
  });
});
