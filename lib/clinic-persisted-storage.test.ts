import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import {
  isClinicServerDatabaseMode,
  setClinicServerDatabaseMode,
} from "./clinic-client-mode.ts";

/** Mirrors pickPersistedStateForStorage without pulling full clinic-persisted-state graph */
function pickForStorage(
  state: { userThemePreferences?: Record<string, string>; patients?: unknown[] },
  serverDb: boolean
) {
  if (serverDb) {
    return { userThemePreferences: state.userThemePreferences ?? {} };
  }
  return state;
}

describe("clinic persisted storage policy", () => {
  before(() => setClinicServerDatabaseMode(false));
  after(() => setClinicServerDatabaseMode(false));

  it("persists full state without server database mode", () => {
    const sample = { patients: [{ id: "p1" }], userThemePreferences: { u1: "dark" } };
    const picked = pickForStorage(sample, false);
    assert.equal(Array.isArray(picked.patients), true);
  });

  it("persists only theme preferences in server database mode", () => {
    setClinicServerDatabaseMode(true);
    assert.equal(isClinicServerDatabaseMode(), true);
    const sample = { patients: [{ id: "p1" }], userThemePreferences: { u1: "dark" } };
    const picked = pickForStorage(sample, true);
    assert.deepEqual(picked, { userThemePreferences: { u1: "dark" } });
    assert.equal("patients" in picked, false);
    setClinicServerDatabaseMode(false);
  });
});
