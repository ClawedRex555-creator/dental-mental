"use client";

import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import type { Doctor, DoctorShiftDay } from "@/lib/types";
import { monthKey, normalizeShiftDay } from "@/lib/clinic-schedule";
import { useClinicStore } from "@/store/useClinicStore";
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
  const { doctorSchedules, saveDoctorMonthSchedule } = useClinicStore();
  const [month, setMonth] = useState(monthKey());
  const [days, setDays] = useState<Record<string, DoctorShiftDay>>({});
  const [defaultStart, setDefaultStart] = useState("10:00");
  const [defaultEnd, setDefaultEnd] = useState("20:00");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthDays = useMemo(() => {
    const start = startOfMonth(parseISO(`${month}-01`));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [month]);

  useEffect(() => {
    if (!open || !doctor) return;
    const mk = month;
    const existing = doctorSchedules.find(
      (s) => s.doctorId === doctor.id && s.month === mk
    );
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
  }, [open, doctor, month, doctorSchedules, defaultStart, defaultEnd]);

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

  const handleSave = () => {
    if (!doctor) return;
    saveDoctorMonthSchedule({
      doctorId: doctor.id,
      month,
      days,
      updatedAt: format(new Date(), "yyyy-MM-dd"),
    });
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
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {monthDays.map((day) => {
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
                      ? "border-teal-400 bg-teal-100 text-teal-900"
                      : "border-slate-300 bg-slate-200 text-slate-500",
                    isSelected && "ring-2 ring-teal-600"
                  )}
                  title={format(day, "d MMMM yyyy", { locale: ru })}
                >
                  <div className="font-semibold">{format(day, "d")}</div>
                  <div className="text-[10px]">{format(day, "EEE", { locale: ru })}</div>
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
            <Button onClick={handleSave}>Сохранить график</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
