import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapDoctorSpecialtyToMedflex } from "./specialties";

describe("mapDoctorSpecialtyToMedflex", () => {
  it("maps orthopedist", () => {
    const s = mapDoctorSpecialtyToMedflex("Стоматолог-ортопед");
    assert.equal(s.id, "47");
  });

  it("defaults to dentist", () => {
    const s = mapDoctorSpecialtyToMedflex("");
    assert.equal(s.id, "48");
  });
});
