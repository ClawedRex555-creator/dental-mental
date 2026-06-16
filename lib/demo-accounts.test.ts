import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  assertDemoAccountsNotEnabledInProduction,
  isDemoAccountsEnabled,
} from "./demo-accounts";
import { setTestEnv } from "./test-env";

describe("demo accounts guard", () => {
  const prev = { ...process.env };

  afterEach(() => {
    setTestEnv(prev);
  });

  it("demo disabled by default in production", () => {
    setTestEnv({ NODE_ENV: "production", ENABLE_DEMO_ACCOUNTS: undefined });
    assert.equal(isDemoAccountsEnabled(), false);
  });

  it("demo enabled in development without flag", () => {
    setTestEnv({ NODE_ENV: "development", ENABLE_DEMO_ACCOUNTS: undefined });
    assert.equal(isDemoAccountsEnabled(), true);
  });

  it("assertDemoAccountsNotEnabledInProduction throws when flag true", () => {
    setTestEnv({ NODE_ENV: "production", ENABLE_DEMO_ACCOUNTS: "true" });
    assert.throws(
      () => assertDemoAccountsNotEnabledInProduction(),
      /ENABLE_DEMO_ACCOUNTS cannot be true in production/
    );
  });

  it("assertDemoAccountsNotEnabledInProduction passes when flag false", () => {
    setTestEnv({ NODE_ENV: "production", ENABLE_DEMO_ACCOUNTS: "false" });
    assert.doesNotThrow(() => assertDemoAccountsNotEnabledInProduction());
  });
});
