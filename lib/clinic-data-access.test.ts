import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import {
  canAccessFullClinicDataSync,
  canReadClinicDataSync,
  canWriteClinicDataSync,
  filterClinicSnapshotForAccountant,
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

  it("filterClinicSnapshotForAccountant strips PHI and non-finance data", () => {
    const state = createFreshPersistedState();
    state.patients = [
      {
        id: "p1",
        firstName: "Анна",
        lastName: "Смирнова",
        phone: "+79990001122",
        email: "anna@example.com",
        snils: "111-222-333 44",
        birthDate: "1985-05-05",
        gender: "female",
        source: "walk_in",
        status: "active",
        balance: 1500,
        totalSpent: 12000,
        disability: "none",
        notes: "секрет",
        diagnosis: "K04",
      },
    ];
    state.payments = [{ id: "pay1", patientId: "p1", amount: 1000, method: "cash", status: "paid", date: "2026-01-01" }];
    state.medicalRecords = [
      {
        id: "mr1",
        patientId: "p1",
        doctorId: "d1",
        complaints: "боль",
        diagnosis: "секрет",
        treatment: "лечение",
        createdAt: "2026-01-01",
      },
    ];
    state.warehouse = [{ id: "w1", name: "Материал", category: "c", quantity: 1, unit: "шт", minStock: 0, price: 100 }];

    const filtered = filterClinicSnapshotForAccountant(state);
    assert.equal(filtered.payments.length, 1);
    assert.equal(filtered.medicalRecords.length, 0);
    assert.equal(filtered.warehouse.length, 0);
    assert.equal(filtered.patients.length, 1);
    const p = filtered.patients[0]!;
    assert.equal(p.firstName, "Анна");
    assert.equal(p.balance, 1500);
    assert.equal((p as { phone?: string }).phone, undefined);
    assert.equal((p as { snils?: string }).snils, undefined);
    assert.equal((p as { notes?: string }).notes, undefined);
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
