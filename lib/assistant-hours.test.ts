import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcAssistantHoursInRange,
  normalizeAssistantManualHours,
  sumManualAssistantHoursInRange,
} from "./assistant-hours";
import type { Appointment } from "./types";

const from = new Date("2026-06-01T00:00:00");
const to = new Date("2026-06-07T23:59:59");

describe("assistant hours by day", () => {
  it("ignores legacy period-wide string values", () => {
    const normalized = normalizeAssistantManualHours({
      a1: "40",
      a2: { "2026-06-03": "6" },
    });
    assert.deepEqual(normalized, { a2: { "2026-06-03": "6" } });
  });

  it("sums only manual hours inside the selected range", () => {
    const manual = normalizeAssistantManualHours({
      a1: { "2026-06-03": "4", "2026-06-20": "8" },
    });
    assert.equal(sumManualAssistantHoursInRange("a1", manual, from, to), 4);
  });

  it("combines appointment hours and manual day shifts", () => {
    const appointments: Appointment[] = [
      {
        id: "apt1",
        patientId: "p1",
        assistantId: "a1",
        assistantHours: 2,
        date: "2026-06-02",
        startTime: "10:00",
        endTime: "11:00",
        durationMinutes: 60,
        status: "completed",
        price: 0,
        paymentStatus: "paid",
      },
    ];
    const manual = normalizeAssistantManualHours({
      a1: { "2026-06-04": "5" },
    });
    assert.equal(calcAssistantHoursInRange("a1", appointments, from, to, manual), 7);
  });
});
