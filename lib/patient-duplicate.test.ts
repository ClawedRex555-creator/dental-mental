import { describe, expect, it } from "vitest";
import type { Patient } from "./types";
import { findDuplicatePatient } from "./patient-duplicate";

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
    expect(match?.patient.id).toBe("pat-1");
    expect(match?.reason).toBe("phone");
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
    expect(match?.reason).toBe("identity");
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
    expect(match).toBeNull();
  });
});
