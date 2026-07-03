import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAverageCheckInRange,
  computeDashboardKPI,
  computePopularServices,
  countNewPatientsInRange,
  sumRevenueInRange,
} from "./analytics.ts";
import type { Appointment, Patient, Payment, WorkAct } from "./types.ts";

const workActs: WorkAct[] = [
  {
    id: "act-1",
    actNumber: "1",
    actDate: "2026-07-10",
    patientId: "p1",
    doctorId: "d1",
    items: [
      {
        id: "i1",
        serviceId: "s1",
        serviceName: "Чистка",
        quantity: 1,
        price: 3000,
        total: 3000,
      },
    ],
    subtotalAmount: 3000,
    discountType: "percent",
    discount: 0,
    totalAmount: 3000,
    paymentStatus: "paid",
    createdAt: "2026-07-10",
    actType: "services",
  },
];

const payments: Payment[] = [
  {
    id: "pay-1",
    patientId: "p1",
    amount: 3000,
    date: "2026-07-15",
    method: "card",
    status: "paid",
    workActId: "act-1",
  },
];

const patients: Patient[] = [
  {
    id: "p1",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "+79990000000",
    birthDate: "1990-01-01",
    gender: "male",
    source: "walk_in",
    status: "active",
    createdAt: "2026-07-05",
    balance: 0,
    totalSpent: 3000,
    disability: "none",
  },
];

const appointments: Appointment[] = [
  {
    id: "a1",
    patientId: "p1",
    doctorId: "d1",
    date: "2026-07-10",
    startTime: "10:00",
    endTime: "11:00",
    durationMinutes: 60,
    status: "completed",
    price: 3000,
    paymentStatus: "paid",
  },
  {
    id: "a2",
    patientId: "p1",
    doctorId: "d1",
    date: "2026-07-11",
    startTime: "10:00",
    endTime: "11:00",
    durationMinutes: 60,
    status: "cancelled",
    price: 0,
    paymentStatus: "pending",
  },
];

describe("sumRevenueInRange", () => {
  it("uses act date for work-act payments", () => {
    const revenue = sumRevenueInRange(
      payments,
      workActs,
      new Date("2026-07-01"),
      new Date("2026-07-31")
    );
    assert.equal(revenue, 3000);
  });

  it("ignores orphan work-act payments", () => {
    const revenue = sumRevenueInRange(
      [
        ...payments,
        {
          id: "orphan",
          patientId: "p1",
          amount: 1000,
          date: "2026-07-10",
          method: "cash",
          status: "paid",
          workActId: "missing-act",
        },
      ],
      workActs,
      new Date("2026-07-01"),
      new Date("2026-07-31")
    );
    assert.equal(revenue, 3000);
  });
});

describe("computeDashboardKPI", () => {
  it("counts new patients by createdAt in current month", () => {
    const kpi = computeDashboardKPI(payments, appointments, patients, workActs, [
      { id: "d1", name: "Доктор", role: "doctor", phone: "", email: "" },
    ]);
    assert.equal(kpi.newPatients, 1);
    assert.equal(kpi.averageCheck, 3000);
  });
});

describe("computePopularServices", () => {
  it("aggregates paid act items even without service catalog match", () => {
    const stats = computePopularServices([], workActs);
    assert.equal(stats.length, 1);
    assert.equal(stats[0]?.name, "Чистка");
    assert.equal(stats[0]?.revenue, 3000);
  });
});

describe("countNewPatientsInRange", () => {
  it("filters patients by createdAt", () => {
    const count = countNewPatientsInRange(
      patients,
      new Date("2026-07-01"),
      new Date("2026-07-31")
    );
    assert.equal(count, 1);
  });
});

describe("computeAverageCheckInRange", () => {
  it("uses paid service acts", () => {
    const average = computeAverageCheckInRange(
      workActs,
      new Date("2026-07-01"),
      new Date("2026-07-31")
    );
    assert.equal(average, 3000);
  });
});
