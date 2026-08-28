import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import {
  canAccessFullClinicDataSync,
  canUseDayToDaySnapshotPut,
  canReadClinicDataSync,
  canWriteClinicDataSync,
  filterClinicSnapshotForAccountant,
  preservePatientPhiForRedactedRoles,
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
    assert.equal(canReadClinicDataSync("partner"), true);
  });

  it("write: owner, admin, doctor, assistant", () => {
    assert.equal(canWriteClinicDataSync("owner"), true);
    assert.equal(canWriteClinicDataSync("admin"), true);
    assert.equal(canWriteClinicDataSync("doctor"), true);
    assert.equal(canWriteClinicDataSync("assistant"), true);
    assert.equal(canWriteClinicDataSync("accountant"), false);
    assert.equal(canWriteClinicDataSync("partner"), true);
  });

  it("canAccessFullClinicDataSync matches write", () => {
    assert.equal(canAccessFullClinicDataSync("doctor"), true);
    assert.equal(canAccessFullClinicDataSync("accountant"), false);
  });

  it("day-to-day snapshot PUT is disabled for all roles", () => {
    assert.equal(canUseDayToDaySnapshotPut("owner"), false);
    assert.equal(canUseDayToDaySnapshotPut("admin"), false);
    assert.equal(canUseDayToDaySnapshotPut("doctor"), false);
    assert.equal(canUseDayToDaySnapshotPut("assistant"), false);
    assert.equal(canUseDayToDaySnapshotPut("accountant"), false);
    assert.equal(canUseDayToDaySnapshotPut("partner"), false);
  });

  it("canManageServices: owner/admin only", () => {
    assert.equal(canManageServices("owner"), true);
    assert.equal(canManageServices("admin"), true);
    assert.equal(canManageServices("doctor"), false);
    assert.equal(canManageServices("assistant"), false);
    assert.equal(canManageServices("partner"), false);
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
        source: "Google",
        status: "active",
        balance: 1500,
        totalSpent: 12000,
        disability: "none",
        createdAt: "2026-01-01",
        notes: "секрет",
        diagnosis: "K04",
      },
    ];
    state.payments = [{ id: "pay1", patientId: "p1", amount: 1000, method: "cash", status: "paid", date: "2026-01-01" }];
    state.appointments = [
      {
        id: "a1",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-01-02",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "completed",
        price: 1000,
        paymentStatus: "paid",
        complaints: "секретная жалоба",
        reason: "клинический reason",
        comment: "комментарий",
      },
    ];
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
    state.warehouse = [{ id: "w1", name: "Материал", category: "c", quantity: 1, unit: "шт", minQuantity: 0, purchasePrice: 100, supplier: "t" }];

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
    assert.equal(filtered.appointments.length, 1);
    assert.equal(filtered.appointments[0]?.complaints, undefined);
    assert.equal(filtered.appointments[0]?.reason, undefined);
    assert.equal(filtered.appointments[0]?.comment, undefined);
  });

  it("preserveServicesForReadOnlyRoles keeps server services for doctor and assistant", () => {
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
    const assistantResult = preserveServicesForReadOnlyRoles("assistant", incoming, existing);
    assert.equal(assistantResult.services[0]?.id, "s1");
    const ownerResult = preserveServicesForReadOnlyRoles("owner", incoming, existing);
    assert.equal(ownerResult.services[0]?.id, "s2");
  });

  it("preservePatientPhiForRedactedRoles restores phones wiped by doctor snapshot", () => {
    const existing = createFreshPersistedState();
    existing.patients = [
      {
        id: "p1",
        firstName: "Анна",
        lastName: "Смирнова",
        phone: "+79990001122",
        email: "anna@example.com",
        snils: "111-222-333 44",
        birthDate: "1985-05-05",
        gender: "female",
        source: "Google",
        status: "active",
        balance: 0,
        totalSpent: 0,
        disability: "none",
        createdAt: "2026-01-01",
        address: "Москва",
      },
    ];
    const incoming = {
      ...existing,
      patients: [
        {
          ...existing.patients[0]!,
          phone: "",
          email: undefined,
          snils: undefined,
          address: undefined,
          firstName: "Анна",
        },
      ],
    };

    const doctorSave = preservePatientPhiForRedactedRoles("doctor", incoming, existing);
    assert.equal(doctorSave.patients[0]?.phone, "+79990001122");
    assert.equal(doctorSave.patients[0]?.email, "anna@example.com");
    assert.equal(doctorSave.patients[0]?.snils, "111-222-333 44");
    assert.equal(doctorSave.patients[0]?.address, "Москва");

    const ownerSave = preservePatientPhiForRedactedRoles("owner", incoming, existing);
    assert.equal(ownerSave.patients[0]?.phone, "+79990001122");

    const assistantSave = preservePatientPhiForRedactedRoles(
      "assistant",
      incoming,
      existing
    );
    assert.equal(assistantSave.patients[0]?.phone, "+79990001122");
  });

  it("preservePatientPhiForRedactedRoles keeps intentional non-empty phone updates", () => {
    const existing = createFreshPersistedState();
    existing.patients = [
      {
        id: "p1",
        firstName: "Анна",
        lastName: "Смирнова",
        phone: "+79990001122",
        birthDate: "1985-05-05",
        gender: "female",
        source: "Google",
        status: "active",
        balance: 0,
        totalSpent: 0,
        disability: "none",
        createdAt: "2026-01-01",
      },
    ];
    const incoming = {
      ...existing,
      patients: [{ ...existing.patients[0]!, phone: "+79993334455" }],
    };
    const saved = preservePatientPhiForRedactedRoles("admin", incoming, existing);
    assert.equal(saved.patients[0]?.phone, "+79993334455");
  });
});
