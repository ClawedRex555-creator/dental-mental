import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  CLINIC_SCOPE_STORAGE_KEY,
  ensureClinicStorageScope,
  readClinicStorageScope,
} from "./clinic-storage-scope";

const storage = new Map<string, string>();

describe("ensureClinicStorageScope", () => {
  beforeEach(() => {
    storage.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
      removeItem: (k) => {
        storage.delete(k);
      },
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("sets scope on first visit", () => {
    assert.equal(ensureClinicStorageScope("ulybka"), true);
    assert.equal(readClinicStorageScope(), "ulybka");
  });

  it("clears PHI cache when clinic slug changes", () => {
    storage.set("dentalcloud-mis-storage-v4", '{"state":{"patients":[{"id":"p1"}]}}');
    storage.set(CLINIC_SCOPE_STORAGE_KEY, "tstom");
    assert.equal(ensureClinicStorageScope("ulybka"), false);
    assert.equal(readClinicStorageScope(), "ulybka");
    assert.equal(storage.has("dentalcloud-mis-storage-v4"), false);
  });
});
