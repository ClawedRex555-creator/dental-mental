import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPatientCatalogDoctor } from "./mobile-catalog-doctors";
import type { Doctor } from "./types";

function baseDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: "d1",
    name: "Dr. Test",
    specialization: "Терапевт",
    phone: "+79990000000",
    email: "test@example.com",
    cabinet: "1",
    commissionPercent: 25,
    status: "active",
    role: "doctor",
    ...overrides,
  };
}

describe("isPatientCatalogDoctor", () => {
  it("includes active doctors", () => {
    assert.equal(isPatientCatalogDoctor(baseDoctor()), true);
  });

  it("includes legacy staff without role", () => {
    assert.equal(
      isPatientCatalogDoctor(baseDoctor({ role: undefined as unknown as Doctor["role"] })),
      true
    );
  });

  it("excludes administrators", () => {
    assert.equal(isPatientCatalogDoctor(baseDoctor({ role: "admin" })), false);
  });

  it("excludes partner clinics", () => {
    assert.equal(isPatientCatalogDoctor(baseDoctor({ role: "partner" })), false);
  });

  it("excludes assistants and accountants", () => {
    assert.equal(isPatientCatalogDoctor(baseDoctor({ role: "assistant" })), false);
    assert.equal(isPatientCatalogDoctor(baseDoctor({ role: "accountant" })), false);
  });

  it("excludes inactive doctors", () => {
    assert.equal(isPatientCatalogDoctor(baseDoctor({ status: "inactive" })), false);
  });
});
