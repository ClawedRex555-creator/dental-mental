import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { format } from "date-fns";
import {
  applyPayWorkActToPersistedState,
  buildPayWorkActPaymentId,
} from "./apply-pay-work-act";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { WorkAct } from "./types";
import { getWorkActSalaryAccrualDate } from "./work-act-payment";

function sampleAct(overrides: Partial<WorkAct> = {}): WorkAct {
  return {
    id: "wa1",
    patientId: "p1",
    doctorId: "d1",
    actDate: "2026-08-09",
    actNumber: "1",
    actType: "services",
    items: [
      {
        id: "i1",
        serviceName: "Услуга",
        quantity: 1,
        price: 1000,
        total: 1000,
      },
    ],
    subtotalAmount: 1000,
    discountType: "percent",
    discount: 0,
    totalAmount: 1000,
    createdAt: "2026-08-09",
    paymentStatus: "pending",
    ...overrides,
  };
}

describe("applyPayWorkActToPersistedState", () => {
  it("builds deterministic payment ids", () => {
    assert.equal(
      buildPayWorkActPaymentId("wa1", 0, 1000, "cash"),
      "pay_wa1_0_100000_cash"
    );
  });

  it("is idempotent for the same payment key", () => {
    const state = createFreshPersistedState();
    state.patients = [
      {
        id: "p1",
        firstName: "A",
        lastName: "B",
        phone: "+79001112233",
        birthDate: "1990-01-01",
        gender: "male",
        source: "Сайт",
        status: "active",
        disability: "not_specified",
        createdAt: "2026-01-01",
        balance: 0,
        totalSpent: 0,
      },
    ];
    state.workActs = [sampleAct()];

    const first = applyPayWorkActToPersistedState(state, {
      actId: "wa1",
      method: "cash",
      amount: 1000,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.payments.length, 1);
    assert.equal(first.state.workActs[0]?.paymentStatus, "paid");
    assert.equal(first.state.workActs[0]?.closedAt, format(new Date(), "yyyy-MM-dd"));
    assert.equal(first.state.payments[0]?.date, format(new Date(), "yyyy-MM-dd"));
    assert.notEqual(first.state.payments[0]?.date, "2026-08-09");

    const second = applyPayWorkActToPersistedState(first.state, {
      actId: "wa1",
      method: "cash",
      amount: 1000,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
    assert.equal(second.state.payments.length, 1);
  });

  it("accrues salary on close day, not act date", () => {
    const state = createFreshPersistedState();
    state.patients = [
      {
        id: "p1",
        firstName: "A",
        lastName: "B",
        phone: "+79001112233",
        birthDate: "1990-01-01",
        gender: "male",
        source: "Сайт",
        status: "active",
        disability: "not_specified",
        createdAt: "2026-01-01",
        balance: 0,
        totalSpent: 0,
      },
    ];
    state.workActs = [sampleAct({ actDate: "2026-08-28" })];

    const paid = applyPayWorkActToPersistedState(state, {
      actId: "wa1",
      method: "cash",
    });
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const act = paid.state.workActs[0]!;
    assert.equal(getWorkActSalaryAccrualDate(act, paid.state.payments), today);
    assert.equal(act.closedAt, today);
  });
});
