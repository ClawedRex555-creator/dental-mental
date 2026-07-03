"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyticsPeriod } from "@/lib/analytics";

interface AnalyticsPeriodFilterProps {
  period: AnalyticsPeriod;
  customFrom: string;
  customTo: string;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

export function AnalyticsPeriodFilter({
  period,
  customFrom,
  customTo,
  onPeriodChange,
  onCustomFromChange,
  onCustomToChange,
}: AnalyticsPeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {(["day", "week", "month", "custom"] as AnalyticsPeriod[]).map((item) => (
        <Button
          key={item}
          size="sm"
          variant={period === item ? "default" : "outline"}
          onClick={() => onPeriodChange(item)}
        >
          {item === "day"
            ? "День"
            : item === "week"
              ? "Неделя"
              : item === "month"
                ? "Месяц"
                : "Период"}
        </Button>
      ))}
      {period === "custom" && (
        <>
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="w-[150px]"
          />
        </>
      )}
    </div>
  );
}
