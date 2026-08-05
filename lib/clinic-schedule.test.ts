import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatScheduleMonthLabel,
  needsScheduleReminder,
  shouldPromptForNextMonthSchedule,
} from "./clinic-schedule";

describe("shouldPromptForNextMonthSchedule", () => {
  it("does not prompt before the 21st", () => {
    assert.equal(shouldPromptForNextMonthSchedule(new Date("2026-07-01")), false);
    assert.equal(shouldPromptForNextMonthSchedule(new Date("2026-07-20")), false);
  });

  it("prompts from the 21st until month end", () => {
    assert.equal(shouldPromptForNextMonthSchedule(new Date("2026-07-21")), true);
    assert.equal(shouldPromptForNextMonthSchedule(new Date("2026-07-31")), true);
  });
});

describe("needsScheduleReminder", () => {
  it("returns null early in the month even if next month is missing", () => {
    const result = needsScheduleReminder([], ["doctor-1"], new Date("2026-07-05"));
    assert.equal(result, null);
  });

  it("returns reminder from the 21st when schedule is missing", () => {
    const result = needsScheduleReminder([], ["doctor-1"], new Date("2026-07-21"));
    assert.deepEqual(result, {
      month: "2026-08",
      missingDoctorIds: ["doctor-1"],
    });
  });

  it("returns null when next month schedule exists", () => {
    const result = needsScheduleReminder(
      [{ doctorId: "doctor-1", month: "2026-08", days: {}, updatedAt: "2026-07-01T00:00:00.000Z" }],
      ["doctor-1"],
      new Date("2026-07-21")
    );
    assert.equal(result, null);
  });
});

describe("formatScheduleMonthLabel", () => {
  it("formats month key in Russian", () => {
    assert.equal(formatScheduleMonthLabel("2026-08"), "Август 2026");
  });
});
