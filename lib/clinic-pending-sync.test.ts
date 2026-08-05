import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  clearPendingClinicSnapshot,
  discardStalePendingClinicSnapshot,
  writePendingClinicSnapshot,
} from "./clinic-pending-sync";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type { Appointment } from "./types";

const SCOPE_KEY = "dentalcloud-mis-clinic-slug-scope";
const TAB_ID_KEY = "dc-clinic-tab-id";

function pendingKeyForTab(tabId: string) {
  return `dc-clinic-pending-v1:tstom:${tabId}`;
}

describe("clinic-pending-sync", () => {
  const prevLocal = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
    globalThis.localStorage = storage;
    globalThis.sessionStorage = storage;
    localStorage.setItem(SCOPE_KEY, "tstom");
    sessionStorage.setItem(TAB_ID_KEY, "tab-test");
  });

  afterEach(() => {
    globalThis.localStorage = prevLocal;
    globalThis.sessionStorage = prevSession;
  });

  it("discardStalePendingClinicSnapshot clears pending when server is newer on shared rows", () => {
    const base = createFreshPersistedState();
    const pendingAppointment: Appointment = {
      id: "a1",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-22",
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    writePendingClinicSnapshot({
      ...base,
      appointments: [pendingAppointment],
    });

    const remote = {
      ...base,
      appointments: [{ ...pendingAppointment, status: "completed" as const }],
    };

    assert.equal(discardStalePendingClinicSnapshot(remote), true);
    assert.equal(localStorage.getItem(pendingKeyForTab("tab-test")), null);
  });

  it("discardStalePendingClinicSnapshot keeps pending with local-only appointments", () => {
    const base = createFreshPersistedState();
    const localOnly: Appointment = {
      id: "a-local",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-07-11",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    writePendingClinicSnapshot({
      ...base,
      appointments: [localOnly],
    });

    const remote = { ...base, appointments: [] };

    assert.equal(discardStalePendingClinicSnapshot(remote), false);
    assert.notEqual(localStorage.getItem(pendingKeyForTab("tab-test")), null);
    clearPendingClinicSnapshot();
  });

  it("discardStalePendingClinicSnapshot leaves pending when server matches buffer", () => {
    const base = createFreshPersistedState();
    const snapshot = {
      ...base,
      appointments: [
        {
          id: "a1",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-06-22",
          startTime: "10:00",
          endTime: "10:30",
          durationMinutes: 30,
          status: "scheduled" as const,
          price: 0,
          paymentStatus: "pending" as const,
        },
      ],
    };
    writePendingClinicSnapshot(snapshot);

    assert.equal(discardStalePendingClinicSnapshot(snapshot), false);
    assert.notEqual(localStorage.getItem(pendingKeyForTab("tab-test")), null);
    clearPendingClinicSnapshot();
  });

  it("uses per-tab pending keys so tabs do not overwrite each other", () => {
    const base = createFreshPersistedState();
    writePendingClinicSnapshot({
      ...base,
      appointments: [
        {
          id: "a-tab1",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-07-01",
          startTime: "10:00",
          endTime: "10:30",
          durationMinutes: 30,
          status: "scheduled",
          price: 0,
          paymentStatus: "pending",
        },
      ],
    });
    assert.ok(localStorage.getItem(pendingKeyForTab("tab-test")));

    sessionStorage.setItem(TAB_ID_KEY, "tab-other");
    writePendingClinicSnapshot({
      ...base,
      appointments: [
        {
          id: "a-tab2",
          patientId: "p2",
          doctorId: "d1",
          date: "2026-07-02",
          startTime: "11:00",
          endTime: "11:30",
          durationMinutes: 30,
          status: "scheduled",
          price: 0,
          paymentStatus: "pending",
        },
      ],
    });

    assert.ok(localStorage.getItem(pendingKeyForTab("tab-test")));
    assert.ok(localStorage.getItem(pendingKeyForTab("tab-other")));
  });
});
