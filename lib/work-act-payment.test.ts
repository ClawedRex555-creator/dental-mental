import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWorkActPaidAmount,
  getWorkActRemainingAmount,
  getPaymentReportingDate,
  filterPaymentsWithExistingWorkActs,
  isWorkActFullyPaid,
  canCloseZeroWorkAct,
  getWorkActSalaryAccrualDate,
  resolvePatientBalanceAfterActPayment,
} from "@/lib/work-act-payment";
import type { Payment, WorkAct } from "@/lib/types";

const act: WorkAct = {
  id: "act-1",
  actNumber: "0001",
  actDate: "2026-06-27",
  patientId: "pat-1",
  items: [],
  subtotalAmount: 10000,
  discountType: "percent",
  discount: 0,
  totalAmount: 10000,
  paymentStatus: "pending",
  createdAt: "2026-06-27",
};

describe("work-act-payment", () => {
  it("sums paid amounts", () => {
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 3000,
        method: "cash",
        status: "paid",
        date: "2026-06-27",
      },
    ];
    assert.equal(getWorkActPaidAmount(payments, "act-1"), 3000);
    assert.equal(getWorkActRemainingAmount(act, payments), 7000);
    assert.equal(isWorkActFullyPaid(act, payments), false);
    assert.equal(getWorkActSalaryAccrualDate(act, payments), null);
  });

  it("accrues salary only after full payment (last payment date)", () => {
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 3000,
        method: "cash",
        status: "paid",
        date: "2026-06-27",
      },
      {
        id: "p2",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 7000,
        method: "card",
        status: "paid",
        date: "2026-07-05",
      },
    ];
    assert.equal(isWorkActFullyPaid(act, payments), true);
    assert.equal(getWorkActSalaryAccrualDate(act, payments), "2026-07-05");
  });

  it("prefers closedAt over payment dates for salary accrual", () => {
    const closed: WorkAct = { ...act, closedAt: "2026-09-04", paymentStatus: "paid" };
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 10000,
        method: "cash",
        status: "paid",
        date: "2026-08-28",
      },
    ];
    assert.equal(getWorkActSalaryAccrualDate(closed, payments), "2026-09-04");
  });

  it("allows closing zero act and accrues on act date", () => {
    const zeroAct: WorkAct = {
      ...act,
      totalAmount: 0,
      paymentStatus: "pending",
    };
    assert.equal(canCloseZeroWorkAct(zeroAct, []), true);
    assert.equal(getWorkActSalaryAccrualDate(zeroAct, []), null);
    const closed: WorkAct = { ...zeroAct, paymentStatus: "paid" };
    assert.equal(canCloseZeroWorkAct(closed, []), false);
    assert.equal(getWorkActSalaryAccrualDate(closed, []), "2026-06-27");
    const closedWithStamp: WorkAct = {
      ...closed,
      closedAt: "2026-09-04",
    };
    assert.equal(getWorkActSalaryAccrualDate(closedWithStamp, []), "2026-09-04");
  });

  it("balance after partial then full payment", () => {
    let balance = 0;
    balance = resolvePatientBalanceAfterActPayment(balance, 10000, 0, 3000);
    assert.equal(balance, -7000);
    balance = resolvePatientBalanceAfterActPayment(balance, 10000, 3000, 7000);
    assert.equal(balance, 0);
  });

  it("drops payments for deleted acts", () => {
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-deleted",
        amount: 5000,
        method: "cash",
        status: "paid",
        date: "2026-06-29",
      },
    ];
    assert.equal(filterPaymentsWithExistingWorkActs(payments, [act]).length, 0);
  });

  it("does not trust paymentStatus without matching payments", () => {
    const paidStatusAct: WorkAct = { ...act, paymentStatus: "paid" };
    assert.equal(isWorkActFullyPaid(paidStatusAct, []), false);
  });

  it("uses act date for reporting when payment date differs", () => {
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 10000,
        method: "cash",
        status: "paid",
        date: "2026-06-29",
      },
    ];
    assert.equal(getPaymentReportingDate(payments[0]!, [act]), "2026-06-27");
  });
});
