import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySubmitWorkActToPersistedState } from "./apply-submit-work-act";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment, WorkAct } from "./types";

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

describe("applySubmitWorkActToPersistedState", () => {
  it("upserts act, marks submittedToAdmin, sets ready_for_payment", () => {
    const base = createFreshPersistedState();
    const state = {
      ...base,
      patients: [
        {
          id: "p1",
          firstName: "Иван",
          lastName: "Иванов",
          phone: "+79001112233",
          birthDate: "1990-01-01",
          gender: "male" as const,
          status: "active" as const,
          source: "Сайт" as const,
          balance: 0,
          totalSpent: 0,
          disability: "none" as const,
          createdAt: "2026-01-01",
        },
      ],
      doctors: [
        {
          id: "d1",
          name: "Доктор",
          specialization: "Терапевт",
          phone: "",
          email: "",
          cabinet: "",
          role: "doctor" as const,
          commissionPercent: 0,
          status: "active" as const,
        },
      ],
      appointments: [apt("completed")],
      workActs: [],
    };

    const applied = applySubmitWorkActToPersistedState(state, act());
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, false);
    assert.equal(applied.state.workActs[0]?.submittedToAdmin, true);
    assert.equal(applied.state.appointments[0]?.status, "ready_for_payment");
    assert.equal(applied.state.appointments[0]?.workActId, "act1");
    assert.ok(applied.state.invoices.some((inv) => inv.workActId === "act1"));
    assert.ok(applied.state.medicalRecords.some((r) => r.workActId === "act1"));
  });

  it("is idempotent when already submitted", () => {
    const base = createFreshPersistedState();
    const submitted = act({ submittedToAdmin: true });
    const state = {
      ...base,
      patients: [
        {
          id: "p1",
          firstName: "Иван",
          lastName: "Иванов",
          phone: "+79001112233",
          birthDate: "1990-01-01",
          gender: "male" as const,
          status: "active" as const,
          source: "Сайт" as const,
          balance: 0,
          totalSpent: 0,
          disability: "none" as const,
          createdAt: "2026-01-01",
        },
      ],
      doctors: [
        {
          id: "d1",
          name: "Доктор",
          specialization: "Терапевт",
          phone: "",
          email: "",
          cabinet: "",
          role: "doctor" as const,
          commissionPercent: 0,
          status: "active" as const,
        },
      ],
      appointments: [{ ...apt("ready_for_payment"), workActId: "act1" }],
      workActs: [submitted],
      invoices: [
        {
          id: "inv1",
          patientId: "p1",
          workActId: "act1",
          amount: 1000,
          paid: 0,
          status: "pending" as const,
          date: "2026-08-12",
          description: "test",
        },
      ],
    };

    const applied = applySubmitWorkActToPersistedState(state, submitted);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.alreadyApplied, true);
  });
});
