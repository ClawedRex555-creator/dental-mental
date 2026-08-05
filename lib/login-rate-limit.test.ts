import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  LOGIN_RATE_MAX_ATTEMPTS,
  __resetLoginRateLimitForTests,
  checkLoginRateLimit,
  clearLoginAttempts,
  loginRateLimitKey,
  loginRateLimitResponse,
  recordLoginFailure,
} from "./login-rate-limit";

describe("login-rate-limit", () => {
  beforeEach(() => {
    __resetLoginRateLimitForTests();
  });

  it("builds key from scope and normalized email without IP", () => {
    assert.equal(
      loginRateLimitKey("clinic:ulybka", "  User@Example.RU "),
      "clinic:ulybka:user@example.ru"
    );
    assert.equal(loginRateLimitKey("platform", "a@b.ru"), "platform:a@b.ru");
  });

  it("blocks after max failures for the same email", () => {
    const key = loginRateLimitKey("clinic:demo", "victim@clinic.ru");
    for (let i = 0; i < LOGIN_RATE_MAX_ATTEMPTS; i++) {
      assert.equal(checkLoginRateLimit(key).allowed, true);
      recordLoginFailure(key);
    }
    const blocked = checkLoginRateLimit(key);
    assert.equal(blocked.allowed, false);
    assert.ok((blocked.retryAfterSec ?? 0) >= 1);
  });

  it("does not block a different email", () => {
    const victim = loginRateLimitKey("clinic:demo", "victim@clinic.ru");
    const other = loginRateLimitKey("clinic:demo", "other@clinic.ru");
    for (let i = 0; i < LOGIN_RATE_MAX_ATTEMPTS; i++) {
      recordLoginFailure(victim);
    }
    assert.equal(checkLoginRateLimit(victim).allowed, false);
    assert.equal(checkLoginRateLimit(other).allowed, true);
  });

  it("isolates scopes for the same email", () => {
    const clinic = loginRateLimitKey("clinic:a", "same@x.ru");
    const platform = loginRateLimitKey("platform", "same@x.ru");
    for (let i = 0; i < LOGIN_RATE_MAX_ATTEMPTS; i++) {
      recordLoginFailure(clinic);
    }
    assert.equal(checkLoginRateLimit(clinic).allowed, false);
    assert.equal(checkLoginRateLimit(platform).allowed, true);
  });

  it("loginRateLimitKey can include client IP", () => {
    const withIp = loginRateLimitKey("clinic:demo", "a@b.ru", "1.2.3.4");
    const without = loginRateLimitKey("clinic:demo", "a@b.ru");
    assert.notEqual(withIp, without);
    assert.match(withIp, /ip:1\.2\.3\.4$/);
  });

  it("clearLoginAttempts removes the lockout", () => {
    const key = loginRateLimitKey("clinic:demo", "ok@clinic.ru");
    for (let i = 0; i < LOGIN_RATE_MAX_ATTEMPTS; i++) {
      recordLoginFailure(key);
    }
    assert.equal(checkLoginRateLimit(key).allowed, false);
    clearLoginAttempts(key);
    assert.equal(checkLoginRateLimit(key).allowed, true);
  });

  it("loginRateLimitResponse returns 429 with Retry-After", () => {
    const res = loginRateLimitResponse(42);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "42");
  });
});
