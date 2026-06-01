import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessFullClinicDataSync } from "./clinic-data-access.ts";

describe("clinic data access", () => {
  it("allows owner and admin only", () => {
    assert.equal(canAccessFullClinicDataSync("owner"), true);
    assert.equal(canAccessFullClinicDataSync("admin"), true);
    assert.equal(canAccessFullClinicDataSync("doctor"), false);
    assert.equal(canAccessFullClinicDataSync("assistant"), false);
    assert.equal(canAccessFullClinicDataSync("accountant"), false);
  });
});
