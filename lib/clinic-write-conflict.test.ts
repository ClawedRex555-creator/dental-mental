import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  mergeClinicDataOnWriteConflict,
} from "./clinic-persisted-state";
import type { Appointment } from "./types";

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
});
