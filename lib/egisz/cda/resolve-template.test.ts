import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCdaTemplate } from "./resolve-template";

const baseRecord = {
  id: "mr1",
  patientId: "p1",
  doctorId: "d1",
  complaints: "Жалобы",
  diagnosis: "K02.1",
  treatment: "",
  createdAt: "2026-07-03",
};

describe("resolveCdaTemplate", () => {
  it("uses consultation for dental examination", () => {
    const meta = resolveCdaTemplate({
      documentType: "semd_dental_examination",
      record: baseRecord,
    });
    assert.equal(meta.key, "consultation_rev4");
    assert.equal(meta.remdCode, "119");
  });

  it("uses referral when referralTarget is set", () => {
    const meta = resolveCdaTemplate({
      documentType: "semd_dental_examination",
      record: { ...baseRecord, referralTarget: "Рентген-кабинет" },
    });
    assert.equal(meta.key, "referral_auxiliary_rev2");
  });

  it("uses instrumental for radiology service code", () => {
    const meta = resolveCdaTemplate({
      documentType: "semd_dental_examination",
      record: { ...baseRecord, serviceCode: "A06.07.003" },
    });
    assert.equal(meta.key, "instrumental_rev5");
  });
});
