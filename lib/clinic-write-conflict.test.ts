import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  mergeClinicDataForSave,
  mergeClinicDataOnWriteConflict,
} from "./clinic-persisted-state";
import type { Appointment, Service, WorkAct } from "./types";

describe("mergeClinicDataOnWriteConflict", () => {
  it("keeps server appointment doctor when client snapshot is stale", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d2",
      date: "2026-06-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      appointments: [appointment],
    };
    const incoming = {
      ...base,
      appointments: [{ ...appointment, doctorId: "d1" }],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments[0]?.doctorId, "d2");
  });

  it("keeps new appointments from client when absent on server", () => {
    const base = createFreshPersistedState();
    const existing = { ...base, appointments: [] };
    const incoming = {
      ...base,
      appointments: [
        {
          id: "apt-new",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-06-20",
          startTime: "12:00",
          endTime: "13:00",
          durationMinutes: 60,
          status: "scheduled" as const,
          price: 0,
          paymentStatus: "pending" as const,
        },
      ],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments.length, 1);
    assert.equal(merged.appointments[0]?.id, "apt-new");
  });

  it("does not resurrect work acts deleted on client during write conflict", () => {
    const base = createFreshPersistedState();
    const act1: WorkAct = {
      id: "wa1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-06-20",
      actNumber: "1",
      actType: "service",
      items: [],
      totalAmount: 1000,
      paymentStatus: "paid",
    };
    const act2: WorkAct = {
      ...act1,
      id: "wa2",
      actNumber: "2",
      patientId: "p2",
    };
    const existing = { ...base, workActs: [act1, act2] };
    const incoming = { ...base, workActs: [act2] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.length, 1);
    assert.equal(merged.workActs[0]?.id, "wa2");
  });

  it("keeps work-act tombstone when stale client still has deleted act", () => {
    const base = createFreshPersistedState();
    const deletedAct: WorkAct = {
      id: "wa0069",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-08",
      actNumber: "0069",
      actType: "service",
      items: [],
      totalAmount: 1000,
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa0069"],
    };
    const incoming = {
      ...base,
      workActs: [deletedAct], // stale tab still has old act
      deletedWorkActIds: [],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.some((a) => a.id === "wa0069"), false);
    assert.equal(merged.deletedWorkActIds?.includes("wa0069"), true);
  });

  it("keeps work-act tombstone when stale client saves without write conflict", () => {
    const base = createFreshPersistedState();
    const deletedAct: WorkAct = {
      id: "wa0069",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-08",
      actNumber: "0069",
      actType: "service",
      items: [],
      totalAmount: 1000,
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa0069"],
    };
    const incoming = {
      ...base,
      workActs: [deletedAct], // stale tab still has old act
      deletedWorkActIds: [],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.workActs.some((a) => a.id === "wa0069"), false);
    assert.equal(merged.deletedWorkActIds?.includes("wa0069"), true);
  });

  it("keeps service tombstone when stale client still has deleted service", () => {
    const base = createFreshPersistedState();
    const deletedService: Service = {
      id: "srv-cleaning",
      name: "Гигиена",
      category: "Терапия",
      price: 5000,
      active: true,
    };
    const existing = {
      ...base,
      services: [],
      deletedServiceIds: ["srv-cleaning"],
    };
    const incoming = {
      ...base,
      services: [deletedService], // stale tab still has old service
      deletedServiceIds: [],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.services.some((service) => service.id === "srv-cleaning"), false);
    assert.equal(merged.deletedServiceIds?.includes("srv-cleaning"), true);
  });

  it("keeps server work acts when stale client sends empty list on write conflict", () => {
    const base = createFreshPersistedState();
    const act: WorkAct = {
      id: "wa1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-06-20",
      actNumber: "1",
      actType: "service",
      items: [],
      totalAmount: 1000,
      paymentStatus: "paid",
    };
    const existing = { ...base, workActs: [act] };
    const incoming = { ...base, workActs: [] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.length, 1);
    assert.equal(merged.workActs[0]?.id, "wa1");
  });

  it("keeps server appointments when stale client sends empty list on write conflict", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-07-08",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = { ...base, appointments: [appointment] };
    const incoming = { ...base, appointments: [] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments.length, 1);
    assert.equal(merged.appointments[0]?.id, "apt1");
  });
});
