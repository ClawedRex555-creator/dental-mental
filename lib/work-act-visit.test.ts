import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVisitFromWorkAct,
  detachDeletedWorkActsFromAppointments,
  isWorkActSyntheticVisit,
  syncVisitForWorkAct,
  workActVisitId,
} from "@/lib/work-act-visit";
import type { Appointment, WorkAct } from "@/lib/types";

const baseAct = (): WorkAct => ({
  id: "act-1",
  actNumber: "0001-06/2026",
  actDate: "2026-06-27",
  patientId: "pat-1",
  doctorId: "doc-1",
  items: [
    {
      id: "w1",
      serviceName: "Пломба",
      quantity: 1,
      price: 5000,
      total: 5000,
    },
  ],
  subtotalAmount: 5000,
  discountType: "percent",
  discount: 0,
  totalAmount: 5000,
  paymentStatus: "pending",
  createdAt: "2026-06-27",
});

describe("syncVisitForWorkAct", () => {
  it("creates synthetic visit for act without appointment", () => {
    const next = syncVisitForWorkAct([], baseAct());
    assert.equal(next.length, 1);
    assert.equal(next[0]?.id, workActVisitId("act-1"));
    assert.equal(next[0]?.workActId, "act-1");
    assert.equal(next[0]?.status, "ready_for_payment");
    assert.match(next[0]?.reason ?? "", /Пломба/);
  });

  it("skips prepayment acts", () => {
    const next = syncVisitForWorkAct([], { ...baseAct(), actType: "prepayment" });
    assert.equal(next.length, 0);
  });

  it("links existing scheduled appointment", () => {
    const next = syncVisitForWorkAct(
      [
        {
          id: "apt-1",
          patientId: "pat-1",
          date: "2026-06-27",
          startTime: "10:00",
          endTime: "10:30",
          durationMinutes: 30,
          status: "scheduled",
          price: 0,
          paymentStatus: "pending",
        },
      ],
      { ...baseAct(), appointmentId: "apt-1" }
    );
    assert.equal(next[0]?.workActId, "act-1");
    assert.equal(next[0]?.status, "ready_for_payment");
  });

  it("completes ready_for_payment when act is paid via workActId link", () => {
    const next = syncVisitForWorkAct(
      [
        {
          id: "apt-1",
          patientId: "pat-1",
          date: "2026-06-27",
          startTime: "10:00",
          endTime: "10:30",
          durationMinutes: 30,
          status: "ready_for_payment",
          price: 5000,
          paymentStatus: "pending",
          workActId: "act-1",
        },
      ],
      { ...baseAct(), paymentStatus: "paid" },
      []
    );
    assert.equal(next[0]?.status, "completed");
    assert.equal(next[0]?.paymentStatus, "paid");
  });

  it("returns same appointments reference when already in sync", () => {
    const appointments = [
      {
        id: "apt-1",
        patientId: "pat-1",
        date: "2026-06-27",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "ready_for_payment" as const,
        price: 5000,
        paymentStatus: "pending" as const,
        workActId: "act-1",
      },
    ];
    const next = syncVisitForWorkAct(appointments, {
      ...baseAct(),
      appointmentId: "apt-1",
    });
    assert.equal(next, appointments);
  });
});

describe("isWorkActSyntheticVisit", () => {
  it("detects synthetic id", () => {
    const visit = buildVisitFromWorkAct(baseAct());
    assert.equal(isWorkActSyntheticVisit(visit), true);
  });
});

describe("detachDeletedWorkActsFromAppointments", () => {
  it("removes synthetic visit and clears workActId for tombstoned act", () => {
    const synthetic = buildVisitFromWorkAct(baseAct());
    const linked: Appointment = {
      id: "apt-1",
      patientId: "pat-1",
      date: "2026-06-27",
      startTime: "14:00",
      endTime: "15:00",
      durationMinutes: 60,
      status: "completed",
      price: 5000,
      paymentStatus: "paid",
      workActId: "act-1",
    };
    const next = detachDeletedWorkActsFromAppointments(
      [synthetic, linked],
      ["act-1"]
    );
    assert.equal(next.length, 1);
    assert.equal(next[0]?.id, "apt-1");
    assert.equal(next[0]?.workActId, undefined);
    assert.equal(next[0]?.paymentStatus, "pending");
  });
});
