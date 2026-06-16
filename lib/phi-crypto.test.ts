import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  decryptClinicSnapshotPhi,
  encryptClinicSnapshotPhi,
  isPhiEncryptionEnabled,
} from "./phi-crypto";
import { createFreshPersistedState } from "./clinic-persisted-state";
import { setTestEnv } from "./test-env";

describe("phi-crypto", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    setTestEnv({ PHI_ENCRYPTION_KEY: "test-phi-key-32chars-minimum!!", NODE_ENV: "test" });
  });

  afterEach(() => {
    setTestEnv(prev);
  });

  it("isPhiEncryptionEnabled when key is set", () => {
    assert.equal(isPhiEncryptionEnabled(), true);
  });

  it("encrypt/decrypt roundtrip for sensitive patient fields", () => {
    const state = createFreshPersistedState();
    state.patients = [
      {
        id: "p1",
        firstName: "Иван",
        lastName: "Петров",
        phone: "+79991234567",
        email: "ivan@example.com",
        birthDate: "1990-01-01",
        gender: "male",
        source: "walk_in",
        status: "active",
        balance: 0,
        totalSpent: 0,
        disability: "none",
        snils: "123-456-789 00",
        notes: "Конфиденциально",
        diagnosis: "K02.1",
      },
    ];

    const encrypted = encryptClinicSnapshotPhi(state);
    const patient = encrypted.patients[0]!;
    assert.notEqual(patient.phone, "+79991234567");
    assert.ok(patient.phone.startsWith("enc:v1:"));
    assert.notEqual(patient.firstName, "Иван");

    const decrypted = decryptClinicSnapshotPhi(encrypted);
    assert.equal(decrypted.patients[0]?.phone, "+79991234567");
    assert.equal(decrypted.patients[0]?.firstName, "Иван");
    assert.equal(decrypted.patients[0]?.notes, "Конфиденциально");
    assert.equal(decrypted.patients[0]?.diagnosis, "K02.1");
  });
});
