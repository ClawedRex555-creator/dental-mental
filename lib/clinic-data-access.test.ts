import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import {
  canAccessFullClinicDataSync,
  canReadClinicDataSync,
  canWriteClinicDataSync,
  preserveServicesForReadOnlyRoles,
} from "./clinic-data-access";
import { canManageServices } from "./rbac";

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

  it("canManageServices: owner/admin only", () => {
    assert.equal(canManageServices("owner"), true);
    assert.equal(canManageServices("admin"), true);
    assert.equal(canManageServices("doctor"), false);
    assert.equal(canManageServices("assistant"), false);
  });

  it("preserveServicesForReadOnlyRoles keeps server services for doctor", () => {
    const existing = createFreshPersistedState();
    existing.services = [
      { id: "s1", name: "Консультация", category: "Терапия", price: 2000 },
    ];
    const incoming = {
      ...existing,
      services: [{ id: "s2", name: "Взлом", category: "Терапия", price: 1 }],
    };
    const result = preserveServicesForReadOnlyRoles("doctor", incoming, existing);
    assert.equal(result.services.length, 1);
    assert.equal(result.services[0]?.id, "s1");
    const ownerResult = preserveServicesForReadOnlyRoles("owner", incoming, existing);
    assert.equal(ownerResult.services[0]?.id, "s2");
  });
});
