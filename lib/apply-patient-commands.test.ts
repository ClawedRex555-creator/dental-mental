import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDeletePatientToPersistedState,
  applyUpsertPatientToPersistedState,
} from "./apply-patient-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment, Patient, WorkAct } from "./types";

function samplePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "p1",
    firstName: "Ирина",
    lastName: "Петрова",
    phone: "+79001112233",
    birthDate: "1990-01-01",
    gender: "female",
    source: "Сайт",
    status: "active",
    disability: "not_specified",
    createdAt: "2026-01-01",
    balance: 0,
    totalSpent: 0,
    ...overrides,
  };
}

function sampleAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt1",
    patientId: "p1",
    doctorId: "d1",
    date: "2026-06-20",
    startTime: "10:00",
    endTime: "11:00",
    durationMinutes: 60,
    status: "scheduled",
    price: 0,
    paymentStatus: "pending",
    ...overrides,
  };
}

function sampleWorkAct(overrides: Partial<WorkAct> = {}): WorkAct {
  return {
    id: "wa1",
    patientId: "p1",
    doctorId: "d1",
    actDate: "2026-06-20",
    actNumber: "1",
    actType: "services",
    items: [],
    subtotalAmount: 1000,
    discountType: "percent",
    discount: 0,
    totalAmount: 1000,
    createdAt: "2026-06-20",
    paymentStatus: "pending",
    ...overrides,
  };
}

describe("apply-patient-commands", () => {
  it("creates a new patient", () => {
    const state = createFreshPersistedState();
    const result = applyUpsertPatientToPersistedState(state, samplePatient());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyApplied, false);
    assert.equal(result.state.patients[0]?.lastName, "Петрова");
  });

  it("updates existing patient name", () => {
    const state = createFreshPersistedState();
    state.patients = [samplePatient()];
    const result = applyUpsertPatientToPersistedState(
      state,
      samplePatient({ firstName: "Анна", lastName: "Сидорова" })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.patients[0]?.firstName, "Анна");
    assert.equal(result.state.patients[0]?.lastName, "Сидорова");
  });

  it("does not wipe server phone with empty client phone", () => {
    const state = createFreshPersistedState();
    state.patients = [samplePatient({ phone: "+79001112233" })];
    const result = applyUpsertPatientToPersistedState(
      state,
      samplePatient({ phone: "", firstName: "Анна" })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.patients[0]?.firstName, "Анна");
    assert.equal(result.state.patients[0]?.phone, "+79001112233");
  });

  it("deletes patient with related entities and tombstones", () => {
    const state = createFreshPersistedState();
    state.patients = [samplePatient(), samplePatient({ id: "p2", lastName: "Другой" })];
    state.appointments = [
      sampleAppointment(),
      sampleAppointment({ id: "apt2", patientId: "p2" }),
    ];
    state.workActs = [
      sampleWorkAct(),
      sampleWorkAct({ id: "wa2", patientId: "p2", actNumber: "2" }),
    ];
    state.medicalRecords = [
      {
        id: "mr1",
        patientId: "p1",
        doctorId: "d1",
        complaints: "",
        diagnosis: "Кариес",
        treatment: "Пломба",
        createdAt: "2026-06-20",
      },
    ];
    state.treatmentPlans = [
      {
        id: "tp1",
        patientId: "p1",
        doctorId: "d1",
        title: "План",
        createdAt: "2026-06-20",
        status: "draft",
        items: [],
        totalAmount: 0,
        discountType: "percent",
        discount: 0,
        finalAmount: 0,
      },
    ];
    state.payments = [
      {
        id: "pay1",
        patientId: "p1",
        amount: 1000,
        method: "cash",
        status: "paid",
        date: "2026-06-20",
        workActId: "wa1",
      },
    ];
    state.invoices = [
      {
        id: "inv1",
        patientId: "p1",
        amount: 1000,
        paid: 1000,
        status: "paid",
        date: "2026-06-20",
        workActId: "wa1",
        description: "Акт",
      },
    ];
    state.prepayments = [
      {
        id: "pp1",
        patientId: "p1",
        items: [],
        totalAmount: 500,
        paidAmount: 500,
        remainingAmount: 500,
        date: "2026-06-20",
      },
    ];
    state.patientFiles = [
      {
        id: "f1",
        patientId: "p1",
        name: "xray.png",
        type: "xray",
        uploadedAt: "2026-06-20",
        dataUrl: "data:image/png;base64,aa",
      },
    ];
    state.patientNotes = [
      {
        id: "n1",
        patientId: "p1",
        text: "note",
        createdAt: "2026-06-20",
        author: "Admin",
        authorId: "u1",
        role: "admin",
      },
    ];
    state.teethByPatient = {
      p1: [{ toothNumber: 11, condition: "healthy" }],
      p2: [{ toothNumber: 21, condition: "healthy" }],
    };

    const result = applyDeletePatientToPersistedState(state, "p1");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyApplied, false);
    assert.equal(result.state.patients.some((p) => p.id === "p1"), false);
    assert.equal(result.state.patients.some((p) => p.id === "p2"), true);
    assert.equal(result.state.appointments.some((a) => a.patientId === "p1"), false);
    assert.equal(result.state.appointments.some((a) => a.id === "apt2"), true);
    assert.equal(result.state.workActs.some((a) => a.patientId === "p1"), false);
    assert.equal(result.state.workActs.some((a) => a.id === "wa2"), true);
    assert.equal(result.state.medicalRecords.length, 0);
    assert.equal(result.state.treatmentPlans.length, 0);
    assert.equal(result.state.payments.length, 0);
    assert.equal(result.state.invoices.length, 0);
    assert.equal(result.state.prepayments.length, 0);
    assert.equal(result.state.patientFiles.length, 0);
    assert.equal(result.state.patientNotes.length, 0);
    assert.equal(result.state.teethByPatient.p1, undefined);
    assert.ok(result.state.teethByPatient.p2);
    assert.equal(result.state.deletedPatientIds?.includes("p1"), true);
    assert.equal(result.state.deletedAppointmentIds?.includes("apt1"), true);
    assert.equal(result.state.deletedWorkActIds?.includes("wa1"), true);
    assert.equal(result.state.deletedMedicalRecordIds?.includes("mr1"), true);
    assert.equal(result.state.deletedTreatmentPlanIds?.includes("tp1"), true);
  });

  it("delete is alreadyApplied when patient already tombstoned", () => {
    const state = createFreshPersistedState();
    state.deletedPatientIds = ["p1"];
    const result = applyDeletePatientToPersistedState(state, "p1");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyApplied, true);
  });

  it("delete fails for missing patient without tombstone", () => {
    const state = createFreshPersistedState();
    const result = applyDeletePatientToPersistedState(state, "missing");
    assert.equal(result.ok, false);
  });
});
