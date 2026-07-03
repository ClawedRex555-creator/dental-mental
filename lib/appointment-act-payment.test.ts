import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWorkActAlreadyPaid,
  syncAppointmentsAfterActPaid,
} from "./appointment-act-payment";
import type { Appointment, Payment, WorkAct } from "./types";

function apt(id: string, status: Appointment["status"]): Appointment {
  return {
    id,
    patientId: "p1",
    date: "2026-06-22",
    startTime: "10:00",
    endTime: "10:30",
    durationMinutes: 30,
    status,
    price: 0,
    paymentStatus: status === "ready_for_payment" ? "pending" : "paid",
    workActId: "act1",
  };
}

function act(id: string): WorkAct {
  return {
    id,
    actNumber: "0014-06/2026",
    actDate: "2026-06-22",
    patientId: "p1",
    appointmentId: "apt1",
    items: [],
    subtotalAmount: 42000,
    discountType: "percent",
    discount: 0,
    totalAmount: 42000,
    paymentStatus: "paid",
    createdAt: "2026-06-22",
  };
}

describe("appointment-act-payment", () => {
  it("syncAppointmentsAfterActPaid completes ready_for_payment", () => {
    const appointments = [apt("apt1", "ready_for_payment")];
    const synced = syncAppointmentsAfterActPaid(appointments, act("act1"));
    assert.equal(synced[0]?.status, "completed");
    assert.equal(synced[0]?.paymentStatus, "paid");
  });

  it("isWorkActAlreadyPaid when fully paid via payments", () => {
    const payments: Payment[] = [
      {
        id: "pay1",
        patientId: "p1",
        workActId: "act1",
        amount: 42000,
        method: "cash",
        status: "paid",
        date: "2026-06-22",
      },
    ];
    assert.equal(
      isWorkActAlreadyPaid({ ...act("act1"), paymentStatus: "pending" }, payments),
      true
    );
  });

  it("isWorkActAlreadyPaid false for partial payment", () => {
    const payments: Payment[] = [
      {
        id: "pay1",
        patientId: "p1",
        workActId: "act1",
        amount: 100,
        method: "cash",
        status: "paid",
        date: "2026-06-22",
      },
    ];
    assert.equal(
      isWorkActAlreadyPaid({ ...act("act1"), paymentStatus: "partial" }, payments),
      false
    );
  });
});
