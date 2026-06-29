import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState, mergeDoctorSchedules } from "./clinic-persisted-state";
import type { Patient, WorkAct } from "./types";
import {
  needsMergeWithServerOnLoad,
  prepareSnapshotAfterServerFetch,
  serverSnapshotHasIncomingUpdates,
  shouldPushSnapshotAfterServerFetch,
} from "./clinic-snapshot-load";
import { writePendingClinicSnapshot, clearPendingClinicSnapshot } from "./clinic-pending-sync";

function patient(id: string): Patient {
  return {
    id,
    firstName: "A",
    lastName: "B",
    phone: "+79000000000",
    birthDate: "1990-01-01",
    gender: "male",
    source: "Сайт",
    status: "active",
    disability: "not_specified",
    createdAt: "2026-01-01",
    balance: 0,
    totalSpent: 0,
  };
}

function workAct(id: string): WorkAct {
  return {
    id,
    actNumber: "0001-06/2026",
    actDate: "2026-06-22",
    patientId: "p1",
    doctorId: "d1",
    items: [{ id: "i1", serviceName: "Приём", price: 1000, quantity: 1, total: 1000 }],
    subtotalAmount: 1000,
    discountType: "percent",
    discount: 0,
    totalAmount: 1000,
    paymentStatus: "pending",
    createdAt: "2026-06-22",
  };
}

describe("clinic-snapshot-load", () => {
  it("fast path: empty local uses remote without extra push", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    const local = createFreshPersistedState();
    assert.equal(needsMergeWithServerOnLoad(local), false);
    const prepared = prepareSnapshotAfterServerFetch(remote, local);
    assert.equal(prepared.patients.length, 1);
    assert.equal(shouldPushSnapshotAfterServerFetch(remote, prepared), false);
  });

  it("server database mode: in-memory local does not force merge without pending", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    const local = createFreshPersistedState();
    local.patients = [patient("p2")];
    const opts = { serverDatabaseMode: true as const };
    assert.equal(needsMergeWithServerOnLoad(local, opts), false);
    const prepared = prepareSnapshotAfterServerFetch(remote, local, opts);
    assert.equal(prepared.patients.length, 1);
    assert.equal(prepared.patients[0]?.id, "p1");
    assert.equal(shouldPushSnapshotAfterServerFetch(remote, prepared, opts), false);
  });

  it("pushes when local has new clinic expenses", () => {
    const remote = createFreshPersistedState();
    const local = createFreshPersistedState();
    local.clinicExpenses = [
      {
        id: "exp-1",
        date: "2026-06-20",
        category: "Аренда",
        amount: 5000,
        description: "Аренда",
      },
    ];
    const prepared = prepareSnapshotAfterServerFetch(remote, local);
    assert.equal(shouldPushSnapshotAfterServerFetch(remote, prepared), true);
  });

  it("keeps server work act when pending session snapshot is stale", () => {
    const remote = createFreshPersistedState();
    remote.workActs = [workAct("act-server")];
    const local = createFreshPersistedState();
    local.workActs = [];

    const pending = createFreshPersistedState();
    pending.workActs = [];
    writePendingClinicSnapshot(pending);

    const prepared = prepareSnapshotAfterServerFetch(remote, local);
    assert.equal(prepared.workActs.some((a) => a.id === "act-server"), true);

    clearPendingClinicSnapshot();
  });

  it("pushes when local doctor schedule differs from remote", () => {
    const remote = createFreshPersistedState();
    remote.doctorSchedules = [
      {
        doctorId: "d1",
        month: "2026-06",
        days: { "2026-06-01": { working: false, startTime: "09:00", endTime: "18:00" } },
        updatedAt: "2026-06-01",
      },
    ];
    const local = createFreshPersistedState();
    local.patients = [patient("p1")];
    local.doctorSchedules = [
      {
        doctorId: "d1",
        month: "2026-06",
        days: { "2026-06-01": { working: true, startTime: "09:00", endTime: "18:00" } },
        updatedAt: "2026-06-22",
      },
    ];
    const prepared = prepareSnapshotAfterServerFetch(remote, local);
    assert.equal(shouldPushSnapshotAfterServerFetch(remote, prepared), true);
  });

  it("mergeDoctorSchedules keeps schedule with newer updatedAt", () => {
    const stale = {
      doctorId: "d1",
      month: "2026-06",
      days: { "2026-06-01": { working: false, startTime: "09:00", endTime: "18:00" } },
      updatedAt: "2026-06-01",
    };
    const fresh = {
      doctorId: "d1",
      month: "2026-06",
      days: { "2026-06-01": { working: true, startTime: "09:00", endTime: "18:00" } },
      updatedAt: "2026-06-22",
    };
    const merged = mergeDoctorSchedules([stale], [fresh]);
    assert.equal(
      (merged[0]?.days["2026-06-01"] as { working: boolean }).working,
      true
    );
    const mergedFromServer = mergeDoctorSchedules([fresh], [stale]);
    assert.equal(
      (mergedFromServer[0]?.days["2026-06-01"] as { working: boolean }).working,
      true
    );
  });

  it("serverSnapshotHasIncomingUpdates ignores timestamp-only server bump", () => {
    const baseline = createFreshPersistedState();
    baseline.appointments = [
      {
        id: "a1",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-06-22",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "scheduled",
        price: 0,
        paymentStatus: "pending",
      },
    ];
    const remote = structuredClone(baseline);

    assert.equal(serverSnapshotHasIncomingUpdates(remote, baseline), false);
  });

  it("serverSnapshotHasIncomingUpdates detects new server appointment", () => {
    const baseline = createFreshPersistedState();
    const remote = createFreshPersistedState();
    remote.appointments = [
      {
        id: "a-new",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-06-22",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "scheduled",
        price: 0,
        paymentStatus: "pending",
      },
    ];
    assert.equal(serverSnapshotHasIncomingUpdates(remote, baseline), true);
  });

  it("serverSnapshotHasIncomingUpdates detects patient field change on server", () => {
    const baseline = createFreshPersistedState();
    baseline.patients = [patient("p1")];
    const remote = createFreshPersistedState();
    remote.patients = [{ ...patient("p1"), phone: "+79991112233" }];
    assert.equal(serverSnapshotHasIncomingUpdates(remote, baseline), true);
  });

  it("serverSnapshotHasIncomingUpdates detects medical record content change", () => {
    const baseline = createFreshPersistedState();
    baseline.medicalRecords = [
      {
        id: "mr1",
        patientId: "p1",
        doctorId: "d1",
        complaints: "Боль",
        diagnosis: "K02",
        treatment: "Пломба",
        createdAt: "2026-06-22",
      },
    ];
    const remote = createFreshPersistedState();
    remote.medicalRecords = [
      {
        id: "mr1",
        patientId: "p1",
        doctorId: "d1",
        complaints: "Боль усилилась",
        diagnosis: "K02",
        treatment: "Пломба",
        createdAt: "2026-06-22",
      },
    ];
    assert.equal(serverSnapshotHasIncomingUpdates(remote, baseline), true);
  });

  it("serverSnapshotHasIncomingUpdates detects new phase-1 sync fields", () => {
    const baseline = createFreshPersistedState();
    const remote = createFreshPersistedState();

    remote.legalDocuments = [
      {
        id: "ld1",
        category: "policy",
        title: "Политика",
        date: "2026-06-22",
      },
    ];
    assert.equal(serverSnapshotHasIncomingUpdates(remote, baseline), true);

    const remoteTemplate = createFreshPersistedState();
    remoteTemplate.documentTemplates = [
      {
        id: "tpl1",
        name: "Согласие",
        category: "consent",
      },
    ];
    assert.equal(serverSnapshotHasIncomingUpdates(remoteTemplate, baseline), true);

    const remoteHours = createFreshPersistedState();
    remoteHours.assistantManualHours = { a1: { "2026-06-22": "4" } };
    assert.equal(serverSnapshotHasIncomingUpdates(remoteHours, baseline), true);

    const remoteTeethKeys = createFreshPersistedState();
    remoteTeethKeys.teethByPatient = { p1: [] };
    assert.equal(serverSnapshotHasIncomingUpdates(remoteTeethKeys, baseline), true);

    const remoteSettings = createFreshPersistedState();
    remoteSettings.clinicSettings = {
      ...baseline.clinicSettings,
      workHours: "Пн-Пт 09:00-18:00",
    };
    assert.equal(serverSnapshotHasIncomingUpdates(remoteSettings, baseline), true);
  });
});
