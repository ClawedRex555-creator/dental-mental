"use client";

import type { ClinicWeeklySchedule, DayWorkHours, WeekdayKey } from "@/lib/types";
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/clinic-schedule";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface ClinicWeeklyHoursFormProps {
  value: ClinicWeeklySchedule;
  onChange: (schedule: ClinicWeeklySchedule) => void;
}

export function ClinicWeeklyHoursForm({ value, onChange }: ClinicWeeklyHoursFormProps) {
  const setDay = (key: WeekdayKey, patch: Partial<DayWorkHours>) => {
    onChange({
      ...value,
      [key]: { ...value[key], ...patch },
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
      <p className="text-sm font-medium text-[var(--foreground)]">Режим работы по дням недели</p>
      <div className="grid gap-2">
        {WEEKDAY_KEYS.map((key) => {
          const day = value[key];
          return (
            <div
              key={key}
              className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2 text-sm sm:grid-cols-[3rem_auto_6rem_6rem]"
            >
              <span className="font-medium text-[var(--foreground)]">{WEEKDAY_LABELS[key]}</span>
              <label className="flex items-center gap-2 text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={!!day.closed}
                  onChange={(e) => setDay(key, { closed: e.target.checked })}
                />
                Выходной
              </label>
              <Input
                type="time"
                disabled={day.closed}
                value={day.open ?? "10:00"}
                onChange={(e) => setDay(key, { open: e.target.value })}
              />
              <Input
                type="time"
                disabled={day.closed}
                value={day.close ?? "19:00"}
                onChange={(e) => setDay(key, { close: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
