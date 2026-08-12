import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDeleteWorkActToPersistedState,
  applyUpsertWorkActToPersistedState,
} from "./apply-work-act-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment, Patient, Payment, WorkAct } from "./types";

function patient(): Patient {
  return {
    id: "p1",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "+79001112233",
    birthDate: "1990-01-01",
    gender: "male",
    status: "active",
    source: "Сайт",
    balance: 0,
    totalSpent: 0,
    disability: "none",
    createdAt: "2026-01-01",
  };
}

function doctor() {
  return {
    id: "d1",
    name: "Доктор",
    specialization: "Терапевт",
    phone: "",
    email: "",
    cabinet: "",
    role: "doctor" as const,
    commissionPercent: 0,
    status: "active" as const,
  };
}

function apt(status: Appointment["status"] = "completed"): Appointment {
  return {
    id: "apt1",
    patientId: "p1",
    doctorId: "d1",
    date: "2026-08-12",
    startTime: "10:00",
    endTime: "10:30",
    durationMinutes: 30,
    status,
    price: 0,
    paymentStatus: "pending",
  };
}

function act(partial?: Partial<WorkAct>): WorkAct {
  return {
    id: "act1",
    actNumber: "0001-08/2026",
    actDate: "2026-08-12",
    patientId: "p1",
    appointmentId: "apt1",
    doctorId: "d1",
    items: [
      {
        id: "wai1",
        serviceName: "Осмотр",
        quantity: 1,
        price: 1000,
        total: 1000,
      },
    ],
    subtotalAmount: 1000,
    discountType: "percent",
    discount: 0,
    totalAmount: 1000,
    paymentStatus: "pending",
    createdAt: "2026-08-12",
    ...partial,
  };
}

function baseState(extra?: Partial<ReturnType<typeof createFreshPersistedState>>) {
  const base = createFreshPersistedState();
  return {
    ...base,
    patients: [patient()],
    doctors: [doctor()],
    appointments: [apt("completed")],
    workActs: [],
    ...extra,
  };
}

describe("applyUpsertWorkActToPersistedState", () => {
  it("creates act with invoice and medical record", () => {
    const state = baseState();
    const applied = applyUpsertWorkActToPersistedState(state, act({ actNumber: "" }), {
      linkAppointmentId: "apt1",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, false);
    assert.equal(applied.state.workActs.length, 1);
    assert.ok(applied.state.workActs[0]?.actNumber);
    assert.equal(applied.state.appointments[0]?.workActId, "act1");
    assert.equal(applied.state.appointments[0]?.status, "completed");
    assert.ok(applied.state.invoices.some((inv) => inv.workActId === "act1"));
    assert.ok(applied.state.medicalRecords.some((r) => r.workActId === "act1"));
    assert.ok(!(applied.state.deletedWorkActIds ?? []).includes("act1"));
  });

  it("updates existing act", () => {
    const existing = act({ notes: "old", invoiceId: "inv1" });
    const state = baseState({
      workActs: [existing],
      invoices: [
        {
          id: "inv1",
          patientId: "p1",
          workActId: "act1",
          amount: 1000,
          paid: 0,
          status: "pending",
          date: "2026-08-12",
          description: "test",
        },
      ],
      appointments: [{ ...apt("completed"), workActId: "act1" }],
    });
    const applied = applyUpsertWorkActToPersistedState(
      state,
      act({
        notes: "new",
        invoiceId: "inv1",
        items: [
          {
            id: "wai1",
            serviceName: "Осмотр",
            quantity: 1,
            price: 1500,
            total: 1500,
          },
        ],
        subtotalAmount: 1500,
        totalAmount: 1500,
      })
    );
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, false);
    assert.equal(applied.state.workActs[0]?.notes, "new");
    assert.equal(applied.state.workActs[0]?.totalAmount, 1500);
    assert.equal(applied.state.invoices[0]?.amount, 1500);
  });

  it("submittedToAdmin sets ready_for_payment", () => {
    const state = baseState();
    const applied = applyUpsertWorkActToPersistedState(state, act(), {
      linkAppointmentId: "apt1",
      submittedToAdmin: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.state.workActs[0]?.submittedToAdmin, true);
    assert.equal(applied.state.appointments[0]?.status, "ready_for_payment");
    assert.equal(applied.state.appointments[0]?.workActId, "act1");
  });

  it("is idempotent when equal", () => {
    const existing = act({ submittedToAdmin: true, invoiceId: "inv1" });
    const state = baseState({
      workActs: [existing],
      appointments: [{ ...apt("ready_for_payment"), workActId: "act1" }],
      invoices: [
        {
          id: "inv1",
          patientId: "p1",
          workActId: "act1",
          amount: 1000,
          paid: 0,
          status: "pending",
          date: "2026-08-12",
          description: "test",
        },
      ],
      medicalRecords: [
        {
          id: "mr1",
          patientId: "p1",
          doctorId: "d1",
          complaints: "x",
          anamnesis: "x",
          lifeAnamnesis: "x",
          objective: "x",
          diagnosis: "x",
          treatment: "Осмотр",
          recommendations: "x",
          workActId: "act1",
          createdAt: "2026-08-12",
        },
      ],
    });
    const withMr = {
      ...existing,
      medicalRecordId: "mr1",
    };
    // First apply to normalize medicalRecordId on act
    const first = applyUpsertWorkActToPersistedState(state, withMr, {
      linkAppointmentId: "apt1",
      submittedToAdmin: true,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = applyUpsertWorkActToPersistedState(first.state, first.state.workActs[0]!, {
      linkAppointmentId: "apt1",
      submittedToAdmin: true,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
  });
});

describe("applyDeleteWorkActToPersistedState", () => {
  it("deletes unpaid act and detaches appointment", () => {
    const existing = act({ invoiceId: "inv1" });
    const state = baseState({
      workActs: [existing],
      appointments: [{ ...apt("ready_for_payment"), workActId: "act1" }],
      invoices: [
        {
          id: "inv1",
          patientId: "p1",
          workActId: "act1",
          amount: 1000,
          paid: 0,
          status: "pending",
          date: "2026-08-12",
          description: "test",
        },
      ],
      medicalRecords: [
        {
          id: "mr1",
          patientId: "p1",
          doctorId: "d1",
          complaints: "x",
          anamnesis: "x",
          lifeAnamnesis: "x",
          objective: "x",
          diagnosis: "x",
          treatment: "Осмотр",
          recommendations: "x",
          workActId: "act1",
          createdAt: "2026-08-12",
        },
      ],
    });
    const applied = applyDeleteWorkActToPersistedState(state, "act1");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, false);
    assert.equal(applied.state.workActs.length, 0);
    assert.ok(applied.state.deletedWorkActIds?.includes("act1"));
    assert.equal(applied.state.invoices.length, 0);
    assert.equal(applied.state.appointments[0]?.workActId, undefined);
    assert.equal(applied.state.appointments[0]?.status, "completed");
    assert.equal(applied.state.medicalRecords[0]?.workActId, undefined);
  });

  it("deletes paid act and reverses patient balance", () => {
    const existing = act({
      invoiceId: "inv1",
      paymentStatus: "paid",
      totalAmount: 1000,
    });
    const payment: Payment = {
      id: "pay1",
      patientId: "p1",
      workActId: "act1",
      amount: 1000,
      method: "cash",
      status: "paid",
      date: "2026-08-12",
    };
    const state = baseState({
      workActs: [existing],
      payments: [payment],
      invoices: [
        {
          id: "inv1",
          patientId: "p1",
          workActId: "act1",
          amount: 1000,
          paid: 1000,
          status: "paid",
          date: "2026-08-12",
          description: "test",
        },
      ],
      patients: [{ ...patient(), balance: 0, totalSpent: 1000 }],
      appointments: [{ ...apt("completed"), workActId: "act1", paymentStatus: "paid" }],
    });
    const applied = applyDeleteWorkActToPersistedState(state, "act1");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.state.payments.length, 0);
    assert.equal(applied.state.patients[0]?.totalSpent, 0);
    // reverseAmount > 0: balance - reverseAmount + act.totalAmount = 0 - 1000 + 1000 = 0
    assert.equal(applied.state.patients[0]?.balance, 0);
    assert.equal(applied.state.appointments[0]?.paymentStatus, "pending");
  });

  it("is idempotent when already tombstoned", () => {
    const state = baseState({
      workActs: [],
      deletedWorkActIds: ["act1"],
    });
    const applied = applyDeleteWorkActToPersistedState(state, "act1");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, true);
  });
});
