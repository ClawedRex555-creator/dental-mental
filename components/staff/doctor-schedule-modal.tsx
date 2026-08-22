"use client";

import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import type { Doctor, DoctorShiftDay } from "@/lib/types";
import { WEEKDAY_SHORT } from "@/lib/constants";
import { monthKey, normalizeShiftDay } from "@/lib/clinic-schedule";
import { runWithoutClinicFlush, useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { upsertDoctorScheduleViaCommandApi } from "@/lib/clinic-snapshot-command.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";

interface DoctorScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor: Doctor | null;
}

export function DoctorScheduleModal({
  open,
  onOpenChange,
  doctor,
}: DoctorScheduleModalProps) {
  const { saveDoctorMonthSchedule } = useClinicStore();
  const [month, setMonth] = useState(monthKey());
  const [days, setDays] = useState<Record<string, DoctorShiftDay>>({});
  const [defaultStart, setDefaultStart] = useState("10:00");
  const [defaultEnd, setDefaultEnd] = useState("19:00");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthStart = useMemo(() => startOfMonth(parseISO(`${month}-01`)), [month]);

  const monthDays = useMemo(() => {
    return eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });
  }, [monthStart]);

  const monthCalendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthStart]);

  useEffect(() => {
    if (!open || !doctor) return;
    // Грузим только при открытии / смене врача / месяца.
    // Не реагируем на doctorSchedules из pull — иначе sync затирает правки в форме.
    const existing = useClinicStore
      .getState()
      .doctorSchedules.find((s) => s.doctorId === doctor.id && s.month === month);
    const loaded: Record<string, DoctorShiftDay> = {};
    if (existing?.days) {
      for (const [dateStr, raw] of Object.entries(existing.days)) {
        loaded[dateStr] = normalizeShiftDay(raw, {
          startTime: defaultStart,
          endTime: defaultEnd,
        });
      }
    }
    setDays(loaded);
    setSelectedDay(null);
    // defaultStart/defaultEnd намеренно не в deps: смена дефолта не должна сбрасывать календарь
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctor, month]);

  const toggleDay = (dateStr: string) => {
    setSelectedDay(dateStr);
    setDays((prev) => {
      const current = normalizeShiftDay(prev[dateStr], {
        startTime: defaultStart,
        endTime: defaultEnd,
      });
      return {
        ...prev,
        [dateStr]: {
          ...current,
          working: !current.working,
          startTime: current.startTime || defaultStart,
          endTime: current.endTime || defaultEnd,
        },
      };
    });
  };

  const setAll = (working: boolean) => {
    const next: Record<string, DoctorShiftDay> = {};
    monthDays.forEach((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      next[dateStr] = {
        working,
        startTime: defaultStart,
        endTime: defaultEnd,
      };
    });
    setDays(next);
  };

  const updateSelectedHours = (field: "startTime" | "endTime", value: string) => {
    if (!selectedDay) return;
    setDays((prev) => {
      const current = normalizeShiftDay(prev[selectedDay], {
        startTime: defaultStart,
        endTime: defaultEnd,
      });
      return {
        ...prev,
        [selectedDay]: { ...current, [field]: value },
      };
    });
  };

  const handleSave = async () => {
    if (!doctor) return;
    // Если указали только время смены и не кликали дни — всё равно сохраняем
    // полный месяц рабочими, иначе запись в расписании оказывается недоступна.
    let daysToSave = days;
    if (Object.keys(daysToSave).length === 0) {
      const next: Record<string, DoctorShiftDay> = {};
      monthDays.forEach((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        next[dateStr] = {
          working: true,
          startTime: defaultStart,
          endTime: defaultEnd,
        };
      });
      daysToSave = next;
      setDays(next);
    }
    const schedule = {
      doctorId: doctor.id,
      month,
      days: daysToSave,
      // ISO: иначе при merge «день = день» stale PUT откатывает график.
      updatedAt: new Date().toISOString(),
    };
    const api = await upsertDoctorScheduleViaCommandApi(schedule);
    if (!api.ok) {
      toast.error(api.error ?? "Не удалось сохранить график на сервере");
      return;
    }
    runWithoutClinicFlush(() => {
      saveDoctorMonthSchedule(schedule);
    });
    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
    useClinicStore.getState().pauseClinicAutoSave(15_000);
    notifyClinicDataChanged();
    toast.success("График смен сохранён");
    onOpenChange(false);
  };

  const selectedShift = selectedDay
    ? normalizeShiftDay(days[selectedDay], {
        startTime: defaultStart,
        endTime: defaultEnd,
      })
    : null;

  if (!doctor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>График смен — {doctor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Месяц</Label>
            <input
              type="month"
              className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Время смены с (по умолчанию)</Label>
              <Input
                type="time"
                value={defaultStart}
                onChange={(e) => setDefaultStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">до</Label>
              <Input
                type="time"
                value={defaultEnd}
                onChange={(e) => setDefaultEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>
              Все смены
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAll(false)}>
              Все выходные
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Зелёный — врач на смене. Укажите часы — они отобразятся в расписании. Нажмите на день,
            чтобы изменить время смены.
          </p>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[var(--muted)]">
            {WEEKDAY_SHORT.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {monthCalendarDays.map((day) => {
              if (!isSameMonth(day, monthStart)) {
                return <div key={day.toISOString()} className="min-h-[52px]" aria-hidden />;
              }
              const dateStr = format(day, "yyyy-MM-dd");
              const shift = normalizeShiftDay(days[dateStr], {
                startTime: defaultStart,
                endTime: defaultEnd,
              });
              const isSelected = selectedDay === dateStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => toggleDay(dateStr)}
                  className={cn(
                    "rounded-lg border px-1 py-2 transition-colors",
                    shift.working
                      ? "border-teal-400 bg-teal-100 text-teal-950 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-100"
                      : "border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
                    isSelected && "ring-2 ring-teal-600 dark:ring-teal-400"
                  )}
                  title={format(day, "d MMMM yyyy, EEEE", { locale: ru })}
                >
                  <div className="font-semibold">{format(day, "d")}</div>
                  {shift.working && (
                    <div className="mt-0.5 text-[9px] leading-tight opacity-90">
                      {shift.startTime}–{shift.endTime}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {selectedDay && selectedShift && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
              <p className="text-sm font-medium">
                {format(parseISO(selectedDay), "d MMMM", { locale: ru })}
                {selectedShift.working ? " — смена" : " — выходной"}
              </p>
              {selectedShift.working && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Начало</Label>
                    <Input
                      type="time"
                      value={selectedShift.startTime}
                      onChange={(e) => updateSelectedHours("startTime", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Конец</Label>
                    <Input
                      type="time"
                      value={selectedShift.endTime}
                      onChange={(e) => updateSelectedHours("endTime", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => void handleSave()}>Сохранить график</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
