import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  mergeClinicDataOnWriteConflict,
} from "./clinic-persisted-state";
import type { Appointment, WorkAct } from "./types";

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
