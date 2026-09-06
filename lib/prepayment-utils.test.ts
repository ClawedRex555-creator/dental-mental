import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOpenPatientPrepayments,
  getOpenPrepaidSources,
  getPrepaymentAvailableCredit,
  getUnsettledPrepaymentItems,
  isPartialServiceActAsPrepayment,
  settlePrepaymentItems,
  withPrepaymentItemIds,
} from "./prepayment-utils";
import type { PatientPrepayment, Payment, WorkAct } from "./types";

describe("getOpenPatientPrepayments", () => {
  it("returns only unsettled prepays with paid amount", () => {
    const rows: PatientPrepayment[] = [
      {
        id: "1",
        patientId: "p1",
        items: [],
        totalAmount: 1000,
        paidAmount: 500,
        remainingAmount: 500,
        date: "2026-01-01",
      },
      {
        id: "2",
        patientId: "p1",
        items: [],
        totalAmount: 1000,
        paidAmount: 500,
        remainingAmount: 0,
        date: "2026-01-02",
        settledAt: "2026-01-03",
      },
      {
        id: "3",
        patientId: "p2",
        items: [],
        totalAmount: 1000,
        paidAmount: 300,
        remainingAmount: 700,
        date: "2026-01-01",
      },
    ];
    const open = getOpenPatientPrepayments(rows, "p1");
    assert.equal(open.length, 1);
    assert.equal(open[0]?.id, "1");
  });

  it("hides prep when credit fully applied even without settledAt", () => {
    const rows: PatientPrepayment[] = [
      {
        id: "1",
        patientId: "p1",
        items: [{ id: "i1", serviceName: "A", price: 500, quantity: 1 }],
        totalAmount: 1000,
        paidAmount: 500,
        remainingAmount: 500,
        settledAmount: 500,
        date: "2026-01-01",
      },
    ];
    assert.equal(getOpenPatientPrepayments(rows, "p1").length, 0);
  });
});

describe("settlePrepaymentItems", () => {
  it("settles selected items and keeps credit open", () => {
    const prep: PatientPrepayment = {
      id: "prep1",
      patientId: "p1",
      items: [
        { id: "a", serviceName: "Пульпит", price: 10000, quantity: 1 },
        { id: "b", serviceName: "Периодонтит", price: 12000, quantity: 1 },
      ],
      totalAmount: 22000,
      paidAmount: 30000,
      remainingAmount: 0,
      date: "2026-09-01",
    };
    const next = settlePrepaymentItems(prep, ["a"], "act1", 10000, "2026-09-06");
    assert.equal(next.items[0]?.settledWorkActId, "act1");
    assert.equal(next.items[1]?.settledWorkActId, undefined);
    assert.equal(next.settledAmount, 10000);
    assert.equal(next.settledAt, undefined);
    assert.equal(getPrepaymentAvailableCredit(next), 20000);
    assert.equal(getUnsettledPrepaymentItems(next).length, 1);
  });

  it("marks fully settled when no open items left", () => {
    const prep: PatientPrepayment = {
      id: "prep1",
      patientId: "p1",
      items: [{ id: "a", serviceName: "A", price: 5000, quantity: 1 }],
      totalAmount: 5000,
      paidAmount: 5000,
      remainingAmount: 0,
      date: "2026-09-01",
    };
    const next = settlePrepaymentItems(prep, ["a"], "act1", 5000, "2026-09-06");
    assert.equal(next.settledAt, "2026-09-06");
    assert.equal(getUnsettledPrepaymentItems(next).length, 0);
  });

  it("assigns stable ids for legacy items", () => {
    const prep: PatientPrepayment = {
      id: "prep1",
      patientId: "p1",
      items: [{ serviceName: "A", price: 1, quantity: 1 }],
      totalAmount: 1,
      paidAmount: 1,
      remainingAmount: 0,
      date: "2026-09-01",
    };
    assert.equal(withPrepaymentItemIds(prep).items[0]?.id, "prep1_item_0");
  });
});

describe("partial acts as prepayments", () => {
  const act = (over: Partial<WorkAct> = {}): WorkAct => ({
    id: "act1",
    actNumber: "42",
    actDate: "2026-01-10",
    patientId: "p1",
    items: [{ id: "i1", serviceName: "Пломба", quantity: 1, price: 5000, total: 5000 }],
    subtotalAmount: 5000,
    discountType: "percent",
    discount: 0,
    totalAmount: 5000,
    paymentStatus: "partial",
    createdAt: "2026-01-10",
    actType: "services",
    ...over,
  });

  it("detects partial service act from payments", () => {
    const payments: Payment[] = [
      {
        id: "pay1",
        patientId: "p1",
        workActId: "act1",
        amount: 2000,
        method: "cash",
        status: "paid",
        date: "2026-01-10",
      },
    ];
    assert.equal(isPartialServiceActAsPrepayment(act(), payments), true);
  });

  it("includes old partial acts in open prepaid sources", () => {
    const payments: Payment[] = [
      {
        id: "pay1",
        patientId: "p1",
        workActId: "act1",
        amount: 2000,
        method: "cash",
        status: "paid",
        date: "2026-01-10",
      },
    ];
    const sources = getOpenPrepaidSources([], [act()], payments, "p1");
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.kind, "partial_act");
    assert.equal(sources[0]?.credit, 2000);
    assert.equal(sources[0]?.remaining, 3000);
  });

  it("merges document prepays and partial acts without duplicate linked act", () => {
    const prep: PatientPrepayment = {
      id: "prep1",
      patientId: "p1",
      items: [{ serviceName: "Гигиена", price: 3000, quantity: 1 }],
      totalAmount: 3000,
      paidAmount: 3000,
      remainingAmount: 0,
      date: "2026-01-05",
      workActId: "prep-act",
      actNumber: "ПР-1",
    };
    const payments: Payment[] = [
      {
        id: "pay1",
        patientId: "p1",
        workActId: "act1",
        amount: 2000,
        method: "cash",
        status: "paid",
        date: "2026-01-10",
      },
    ];
    const sources = getOpenPrepaidSources(
      [prep],
      [act(), act({ id: "prep-act", actType: "prepayment", paymentStatus: "paid" })],
      payments,
      "p1"
    );
    assert.ok(sources.some((s) => s.kind === "document"));
    assert.ok(sources.some((s) => s.kind === "partial_act"));
  });
});
