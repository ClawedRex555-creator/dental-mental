import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValid } from "date-fns";
import { getSalaryPeriodRange, isDateInRange } from "./salary-period";

describe("getSalaryPeriodRange", () => {
  it("custom with valid from/to", () => {
    const { from, to } = getSalaryPeriodRange("custom", "2026-09-01", "2026-09-10");
    assert.equal(isValid(from), true);
    assert.equal(isValid(to), true);
    assert.equal(isDateInRange("2026-09-05", from, to), true);
    assert.equal(isDateInRange("2026-08-31", from, to), false);
  });

  it("custom with empty dates does not yield Invalid Date", () => {
    const empty = getSalaryPeriodRange("custom", "", "");
    assert.equal(isValid(empty.from), true);
    assert.equal(isValid(empty.to), true);

    const partial = getSalaryPeriodRange("custom", "2026-09-01", "");
    assert.equal(isValid(partial.from), true);
    assert.equal(isValid(partial.to), true);
  });

  it("custom with garbage dates falls back safely", () => {
    const bad = getSalaryPeriodRange("custom", "not-a-date", "also-bad");
    assert.equal(isValid(bad.from), true);
    assert.equal(isValid(bad.to), true);
  });
});
