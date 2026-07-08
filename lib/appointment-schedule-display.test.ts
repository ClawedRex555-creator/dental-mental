import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getScheduleAppointmentStatusLabel,
  isAppointmentPaidOnSchedule,
  resolveAppointmentWorkAct,
} from "./appointment-schedule-display";
import type { Appointment, WorkAct } from "./types";

function apt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt1",
    patientId: "p1",
    date: "2026-06-29",
    startTime: "10:00",
    endTime: "10:30",
    durationMinutes: 30,
    status: "completed",
    price: 17500,
    paymentStatus: "pending",
    ...overrides,
  };
}

function act(overrides: Partial<WorkAct> = {}): WorkAct {
  return {
    id: "act1",
    actNumber: "0015-06/2026",
    actDate: "2026-06-29",
    patientId: "p1",
    appointmentId: "apt1",
    items: [],
    subtotalAmount: 17500,
    discountType: "percent",
    discount: 0,
    totalAmount: 17500,
    paymentStatus: "paid",
    createdAt: "2026-06-29",
    ...overrides,
  };
}

describe("appointment-schedule-display", () => {
  it("resolves act by workActId or appointmentId", () => {
    assert.equal(resolveAppointmentWorkAct(apt({ workActId: "act1" }), [act()])?.id, "act1");
    assert.equal(resolveAppointmentWorkAct(apt(), [act()])?.actNumber, "0015-06/2026");
  });

  it("ignores tombstoned deleted acts", () => {
    assert.equal(
      resolveAppointmentWorkAct(apt({ workActId: "act1" }), [act()], ["act1"]),
      undefined
    );
    assert.equal(resolveAppointmentWorkAct(apt(), [act()], ["act1"]), undefined);
  });

  it("shows Оплачен when appointment or act is paid", () => {
    const linked = act();
    assert.equal(
      getScheduleAppointmentStatusLabel(apt({ paymentStatus: "paid" }), linked),
      "Оплачен"
    );
    assert.equal(
      getScheduleAppointmentStatusLabel(apt({ status: "completed" }), linked),
      "Оплачен"
    );
    assert.equal(
      isAppointmentPaidOnSchedule(apt(), linked, [
        {
          id: "pay1",
          patientId: "p1",
          workActId: "act1",
          amount: 17500,
          method: "cash",
          status: "paid",
          date: "2026-06-29",
        },
      ]),
      true
    );
  });
});
