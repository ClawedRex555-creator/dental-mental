import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCabinetIdForDoctor } from "./cabinet-utils.ts";
import type { Cabinet, Doctor } from "./types.ts";

function doctor(overrides: Partial<Doctor> & Pick<Doctor, "id">): Doctor {
  return {
    name: "Dr",
    specialization: "Терапевт",
    phone: "",
    email: "",
    cabinet: "—",
    commissionPercent: 0,
    status: "active",
    role: "doctor",
    ...overrides,
  };
}

function cabinet(overrides: Partial<Cabinet> & Pick<Cabinet, "id">): Cabinet {
  return {
    name: "Кабинет 1",
    number: "101",
    equipment: [],
    staffIds: [],
    status: "active",
    ...overrides,
  };
}

describe("resolveCabinetIdForDoctor", () => {
  const cabinets = [
    cabinet({ id: "cab-1", name: "Терапия", number: "1" }),
    cabinet({ id: "cab-2", name: "Хирургия", number: "2", staffIds: ["doc-2"] }),
  ];

  it("resolves by doctor.cabinetId", () => {
    const doctors = [doctor({ id: "doc-1", cabinetId: "cab-1", cabinet: "Терапия" })];
    assert.equal(resolveCabinetIdForDoctor("doc-1", doctors, cabinets), "cab-1");
  });

  it("resolves by cabinet.staffIds when cabinetId missing", () => {
    const doctors = [doctor({ id: "doc-2", cabinet: "—" })];
    assert.equal(resolveCabinetIdForDoctor("doc-2", doctors, cabinets), "cab-2");
  });

  it("resolves by legacy doctor.cabinet label", () => {
    const doctors = [doctor({ id: "doc-3", cabinet: "Хирургия №2" })];
    assert.equal(resolveCabinetIdForDoctor("doc-3", doctors, cabinets), "cab-2");
  });

  it("handles cabinets without staffIds array", () => {
    const looseCabinets = [{ ...cabinets[0], staffIds: undefined as unknown as string[] }];
    const doctors = [doctor({ id: "doc-2", cabinet: "Хирургия" })];
    assert.equal(resolveCabinetIdForDoctor("doc-2", doctors, looseCabinets), undefined);
  });

  it("returns undefined when doctor is not linked", () => {
    const doctors = [doctor({ id: "doc-9", cabinet: "—" })];
    assert.equal(resolveCabinetIdForDoctor("doc-9", doctors, cabinets), undefined);
  });
});
