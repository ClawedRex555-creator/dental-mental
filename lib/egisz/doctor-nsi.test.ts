import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapSpecializationToPositionCode,
  resolveDoctorN3PositionId,
  resolveDoctorN3SpecialityId,
  resolveDoctorPositionCode,
} from "./doctor-nsi";
import { formatCdaEffectiveTime, formatN3DateTime } from "./cda/xml-utils";

describe("doctor NSI dental defaults", () => {
  it("maps therapist specialization to position 103", () => {
    assert.equal(mapSpecializationToPositionCode("Стоматолог-терапевт"), "103");
  });

  it("replaces legacy sample position 34/114 with dentist", () => {
    const pos = resolveDoctorPositionCode({
      positionCode: "34",
      specialization: "Стоматолог-терапевт",
    });
    assert.equal(pos.code, "103");
    assert.equal(pos.displayName, "врач-стоматолог-терапевт");
    assert.equal(
      resolveDoctorN3PositionId({ n3PositionId: "114", specialization: "Стоматолог" }),
      "100"
    );
  });

  it("replaces legacy sample speciality 28 with dentistry GP", () => {
    assert.equal(
      resolveDoctorN3SpecialityId({ n3SpecialityId: "28", specialization: "Стоматолог" }),
      "171"
    );
  });
});

describe("EGISZ timezone +0300", () => {
  it("formats CDA effectiveTime with +0300 wall clock", () => {
    const d = new Date("2026-07-16T09:30:00+03:00");
    assert.equal(formatCdaEffectiveTime(d, "+0300"), "202607160930+0300");
  });

  it("formats N3 CreationDate with +03:00", () => {
    const d = new Date("2026-07-16T09:30:00+03:00");
    assert.equal(formatN3DateTime(d, "+0300"), "2026-07-16T09:30:00+03:00");
  });
});
