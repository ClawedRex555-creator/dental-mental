import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Patient } from "./types";
import {
  needsMergeWithServerOnLoad,
  prepareSnapshotAfterServerFetch,
  shouldPushSnapshotAfterServerFetch,
} from "./clinic-snapshot-load";

function patient(id: string): Patient {
  return {
    id,
    firstName: "A",
    lastName: "B",
    phone: "+79000000000",
    birthDate: "1990-01-01",
    gender: "male",
    source: "Сайт",
    status: "active",
    disability: "not_specified",
    createdAt: "2026-01-01",
    balance: 0,
    totalSpent: 0,
  };
}

describe("clinic-snapshot-load", () => {
  it("fast path: empty local uses remote without extra push", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    const local = createFreshPersistedState();
    assert.equal(needsMergeWithServerOnLoad(local), false);
    const prepared = prepareSnapshotAfterServerFetch(remote, local);
    assert.equal(prepared.patients.length, 1);
    assert.equal(shouldPushSnapshotAfterServerFetch(remote, prepared), false);
  });
});
