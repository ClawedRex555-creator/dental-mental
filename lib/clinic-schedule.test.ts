import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatScheduleMonthLabel,
  isIntervalWithinDoctorHours,
  isScheduleSlotWithinDoctorHours,
  missingDoctorSchedulesForMonth,
  needsScheduleReminder,
  shouldPromptForNextMonthSchedule,
} from "./clinic-schedule";
import type { DoctorMonthSchedule } from "./types";

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

describe("isScheduleSlotWithinDoctorHours", () => {
  const schedules: DoctorMonthSchedule[] = [
    {
      doctorId: "doc-1",
      month: "2026-08",
      updatedAt: "2026-08-01T00:00:00.000Z",
      days: {
        "2026-08-10": { working: true, startTime: "11:00", endTime: "16:00" },
        "2026-08-11": { working: false, startTime: "10:00", endTime: "19:00" },
      },
    },
  ];

  it("allows slots fully inside the shift", () => {
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "11:00", schedules),
      true
    );
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "15:30", schedules),
      true
    );
  });

  it("blocks slots before or after the shift", () => {
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "10:00", schedules),
      false
    );
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "16:00", schedules),
      false
    );
  });

  it("blocks all slots on a day off", () => {
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-11", "12:00", schedules),
      false
    );
  });

  it("uses default hours when month schedule is missing", () => {
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "10:00", []),
      true
    );
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-10", "18:30", []),
      true
    );
  });

  it("uses default hours when the day is not listed in the month schedule", () => {
    assert.equal(
      isScheduleSlotWithinDoctorHours("doc-1", "2026-08-12", "12:00", schedules),
      true
    );
  });

  it("rejects intervals that spill past shift end", () => {
    assert.equal(
      isIntervalWithinDoctorHours(
        "doc-1",
        "2026-08-10",
        "15:00",
        "16:30",
        schedules
      ),
      false
    );
    assert.equal(
      isIntervalWithinDoctorHours(
        "doc-1",
        "2026-08-10",
        "15:00",
        "16:00",
        schedules
      ),
      true
    );
  });
});

describe("missingDoctorSchedulesForMonth", () => {
  it("lists doctors without a month schedule", () => {
    assert.deepEqual(
      missingDoctorSchedulesForMonth(
        [{ doctorId: "a", month: "2026-08", days: {}, updatedAt: "x" }],
        ["a", "b"],
        "2026-08-15"
      ),
      { month: "2026-08", missingDoctorIds: ["b"] }
    );
  });

  it("returns null when everyone has a schedule", () => {
    assert.equal(
      missingDoctorSchedulesForMonth(
        [{ doctorId: "a", month: "2026-08", days: {}, updatedAt: "x" }],
        ["a"],
        "2026-08"
      ),
      null
    );
  });
});
