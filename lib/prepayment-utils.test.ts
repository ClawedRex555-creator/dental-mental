import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOpenPatientPrepayments,
  getOpenPrepaidSources,
  isPartialServiceActAsPrepayment,
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
    const sources = getOpenPrepaidSources(
      [],
      [act()],
      payments,
      "p1"
    );
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
        amount: 1000,
        method: "card",
        status: "paid",
        date: "2026-01-10",
      },
    ];
    const sources = getOpenPrepaidSources(
      [prep],
      [act(), act({ id: "prep-act", actType: "prepayment", totalAmount: 3000, paymentStatus: "paid" })],
      payments,
      "p1"
    );
    assert.equal(sources.some((s) => s.kind === "document"), true);
    assert.equal(sources.some((s) => s.kind === "partial_act" && s.act?.id === "act1"), true);
  });
});
