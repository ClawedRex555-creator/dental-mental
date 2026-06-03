import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessFullClinicDataSync,
  canReadClinicDataSync,
  canWriteClinicDataSync,
} from "./clinic-data-access.ts";

describe("clinic data sync access", () => {
  it("read: clinical and finance roles", () => {
    assert.equal(canReadClinicDataSync("owner"), true);
    assert.equal(canReadClinicDataSync("admin"), true);
    assert.equal(canReadClinicDataSync("doctor"), true);
    assert.equal(canReadClinicDataSync("assistant"), true);
    assert.equal(canReadClinicDataSync("accountant"), true);
  });

  it("write: owner, admin, doctor, assistant", () => {
    assert.equal(canWriteClinicDataSync("owner"), true);
    assert.equal(canWriteClinicDataSync("admin"), true);
    assert.equal(canWriteClinicDataSync("doctor"), true);
    assert.equal(canWriteClinicDataSync("assistant"), true);
    assert.equal(canWriteClinicDataSync("accountant"), false);
  });

  it("canAccessFullClinicDataSync matches write", () => {
    assert.equal(canAccessFullClinicDataSync("doctor"), true);
    assert.equal(canAccessFullClinicDataSync("accountant"), false);
  });
});
