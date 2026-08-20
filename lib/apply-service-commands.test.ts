import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDeleteServiceToPersistedState,
  applyUpsertServiceToPersistedState,
} from "./apply-service-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";

describe("apply-service-commands", () => {
  it("upserts service and survives second identical call as alreadyApplied", () => {
    const base = createFreshPersistedState();
    const service = {
      id: "srv-1",
      name: "Гигиена",
      category: "Терапия",
      price: 3000,
    };
    const first = applyUpsertServiceToPersistedState(base, service);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.services[0]?.name, "Гигиена");

    const second = applyUpsertServiceToPersistedState(first.state, service);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
  });

  it("updates category and name on existing id", () => {
    const base = createFreshPersistedState();
    const created = applyUpsertServiceToPersistedState(base, {
      id: "srv-1",
      name: "Старое",
      category: "Терапия",
      price: 1000,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const updated = applyUpsertServiceToPersistedState(created.state, {
      id: "srv-1",
      name: "Новое",
      category: "Хирургия",
      price: 1000,
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.state.services[0]?.name, "Новое");
    assert.equal(updated.state.services[0]?.category, "Хирургия");
  });

  it("deletes with tombstone", () => {
    const base = createFreshPersistedState();
    const created = applyUpsertServiceToPersistedState(base, {
      id: "srv-1",
      name: "Удалить",
      category: "Терапия",
      price: 1000,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const deleted = applyDeleteServiceToPersistedState(created.state, "srv-1");
    assert.equal(deleted.ok, true);
    if (!deleted.ok) return;
    assert.equal(deleted.state.services.length, 0);
    assert.ok(deleted.state.deletedServiceIds?.includes("srv-1"));
  });
});
