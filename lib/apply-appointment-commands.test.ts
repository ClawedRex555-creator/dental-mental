import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCancelAppointmentToPersistedState,
  applyCreateAppointmentToPersistedState,
  applyUpdateAppointmentToPersistedState,
} from "./apply-appointment-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment } from "./types";

function sampleApt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt1",
    patientId: "p1",
    doctorId: "d1",
    date: "2026-08-11",
    startTime: "10:00",
    endTime: "10:30",
    durationMinutes: 30,
    status: "scheduled",
    price: 0,
    paymentStatus: "pending",
    complaints: "боль",
    ...overrides,
  };
}

function baseState() {
  const state = createFreshPersistedState();
  state.patients = [
    {
      id: "p1",
      firstName: "A",
      lastName: "B",
      phone: "+79001112233",
      birthDate: "1990-01-01",
      gender: "male",
      source: "Сайт",
      status: "active",
      disability: "not_specified",
      createdAt: "2026-01-01",
      balance: 0,
      totalSpent: 0,
    },
  ];
  state.doctors = [
    {
      id: "d1",
      name: "Доктор",
      specialization: "Терапия",
      phone: "",
      email: "",
      cabinet: "",
      commissionPercent: 0,
      status: "active",
      role: "doctor",
    },
  ];
  return state;
}

describe("apply-appointment-commands", () => {
  it("create is idempotent for the same id", () => {
    const state = baseState();
    const apt = sampleApt();
    const first = applyCreateAppointmentToPersistedState(state, apt);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.appointments.length, 1);

    const second = applyCreateAppointmentToPersistedState(first.state, apt);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
    assert.equal(second.state.appointments.length, 1);
  });

  it("cancel twice is safe", () => {
    const state = baseState();
    const created = applyCreateAppointmentToPersistedState(state, sampleApt());
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const first = applyCancelAppointmentToPersistedState(created.state, "apt1");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.appointments[0]?.status, "cancelled");

    const second = applyCancelAppointmentToPersistedState(first.state, "apt1");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
  });

  it("update no-op is alreadyApplied", () => {
    const state = baseState();
    const created = applyCreateAppointmentToPersistedState(state, sampleApt());
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const updated = applyUpdateAppointmentToPersistedState(created.state, "apt1", {
      status: "scheduled",
      complaints: "боль",
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.alreadyApplied, true);
  });
});
