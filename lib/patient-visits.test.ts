import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment, Patient } from "./types";
import {
  countClinicVisits,
  derivePatientVisitFields,
  findOrphanPatientIds,
  otherClinicVisitId,
  patientsLostButAppointmentsRemain,
  repairMissingPatientsInSnapshot,
  syncOtherClinicVisitsInList,
} from "./patient-visits";

function patient(id: string): Patient {
  return {
    id,
    firstName: "Ivan",
    lastName: "Ivanov",
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

function apt(patientId: string, status: Appointment["status"], date: string): Appointment {
  return {
    id: `apt-${patientId}-${date}`,
    patientId,
    date,
    startTime: "10:00",
    endTime: "10:30",
    durationMinutes: 30,
    status,
    price: 0,
    paymentStatus: "pending",
  };
}

describe("patient-visits", () => {
  it("derivePatientVisitFields sets lastVisit from completed appointment", () => {
    const p = patient("p1");
    const fields = derivePatientVisitFields(
      p,
      [apt("p1", "completed", "2026-05-20")],
      "2026-06-01"
    );
    assert.equal(fields.lastVisitDate, "2026-05-20");
  });

  it("findOrphanPatientIds detects missing patient with appointment", () => {
    const state = createFreshPersistedState();
    state.appointments = [apt("missing", "scheduled", "2026-06-10")];
    assert.deepEqual(findOrphanPatientIds(state), ["missing"]);
  });

  it("repairMissingPatientsInSnapshot adds stub patient", () => {
    const state = createFreshPersistedState();
    state.appointments = [apt("missing", "arrived", "2026-06-10")];
    const repaired = repairMissingPatientsInSnapshot(state);
    assert.equal(repaired.patients.length, 1);
    assert.equal(repaired.patients[0]?.id, "missing");
    assert.equal(countClinicVisits(repaired.appointments, "missing"), 1);
  });

  it("repairMissingPatientsInSnapshot does not revive tombstoned patient", () => {
    const state = createFreshPersistedState();
    state.deletedPatientIds = ["missing"];
    state.deletedAppointmentIds = ["apt-missing"];
    state.appointments = [{ ...apt("missing", "arrived", "2026-06-10"), id: "apt-missing" }];
    const repaired = repairMissingPatientsInSnapshot(state);
    assert.equal(repaired.patients.some((p) => p.id === "missing"), false);
  });

  it("syncOtherClinicVisitsInList adds visit with badge data", () => {
    const p = {
      ...patient("p1"),
      hadPreviousVisits: true,
      previousVisitsNote: "Лечение в клинике X, 2024",
    };
    const list = syncOtherClinicVisitsInList([], p);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, otherClinicVisitId("p1"));
    assert.equal(list[0]?.isOtherClinicVisit, true);
    assert.equal(list[0]?.complaints, "Лечение в клинике X, 2024");
    assert.equal(countClinicVisits(list, "p1"), 0);
  });

  it("patientsLostButAppointmentsRemain detects orphan appointments in incoming", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.appointments = [apt("p1", "scheduled", "2026-06-10")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: [] };
    assert.equal(patientsLostButAppointmentsRemain(existing, incoming), true);
  });

  it("patientsLostButAppointmentsRemain ignores server-only orphan appointments", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1"), patient("p2")];
    existing.appointments = [apt("p2", "scheduled", "2026-06-10")];

    const incoming = {
      ...existing,
      patients: [patient("p1")],
      appointments: [],
    };
    assert.equal(patientsLostButAppointmentsRemain(existing, incoming), false);
  });
});
