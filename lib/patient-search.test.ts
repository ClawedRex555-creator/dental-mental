import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPatientsByQuery, patientMatchesQuery } from "./patient-search";
import type { Patient } from "./types";

const patient: Patient = {
  id: "p1",
  firstName: "Иван",
  lastName: "Петров",
  middleName: "Сергеевич",
  phone: "+7 (999) 123-45-67",
  email: "ivan@example.com",
  birthDate: "1990-01-01",
  gender: "male",
  source: "Сайт",
  status: "active",
  createdAt: "2024-01-01",
  balance: 0,
  totalSpent: 0,
  disability: "none",
};

describe("patient search", () => {
  it("matches by full name", () => {
    assert.equal(patientMatchesQuery(patient, "петров иван"), true);
  });

  it("matches by phone digits", () => {
    assert.equal(patientMatchesQuery(patient, "999123"), true);
  });

  it("filters list", () => {
    const results = filterPatientsByQuery([patient], "999123");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, "p1");
  });
});
