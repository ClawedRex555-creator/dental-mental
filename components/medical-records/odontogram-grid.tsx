"use client";

import { ToothIcon } from "@/components/medical-records/tooth-icon";
import {
  LOWER_LEFT_TEETH,
  LOWER_RIGHT_TEETH,
  UPPER_LEFT_TEETH,
  UPPER_RIGHT_TEETH,
} from "@/lib/constants";
import {
  formatConditionsList,
  getSurfaceConditions,
  primaryCondition,
  TOOTH_SURFACE_SHORT,
} from "@/lib/tooth-record-utils";
import type { ToothCondition, ToothRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function ToothCell({
  num,
  jaw,
  teeth,
  selectedTooth,
  readOnly,
  canPaint,
  onSelect,
}: {
  num: number;
  jaw: "upper" | "lower";
  teeth: ToothRecord[];
  selectedTooth: number | null;
  readOnly: boolean;
  canPaint: boolean;
  onSelect: (n: number) => void;
}) {
  const tooth = teeth.find((t) => t.toothNumber === num);
  const condition: ToothCondition = tooth
    ? primaryCondition(
        tooth.vestibularConditions ?? [],
        tooth.lingualConditions ?? [],
        tooth.condition
      )
    : "healthy";
  const selected = selectedTooth === num;
  const vest = getSurfaceConditions(tooth, "vestibular");
  const ling = getSurfaceConditions(tooth, "lingual");
  const title = [
    `Зуб ${num}`,
    `${TOOTH_SURFACE_SHORT.vestibular}: ${formatConditionsList(vest)}`,
    `${TOOTH_SURFACE_SHORT.lingual}: ${formatConditionsList(ling)}`,
  ].join("\n");

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onSelect(num)}
      className={cn(
        "flex min-w-0 justify-center rounded-lg p-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
        canPaint && "cursor-crosshair",
        !readOnly && "hover:bg-teal-50/80",
        selected && "bg-teal-100 ring-2 ring-teal-600 ring-offset-1"
      )}
      title={title}
    >
      <ToothIcon number={num} condition={condition} jaw={jaw} size="lg" />
    </button>
  );
}

/** 8 зубов | середина | 8 зубов — без переноса строк */
const ARCH_GRID =
  "grid w-full grid-cols-[repeat(8,minmax(2.75rem,1fr))_4px_repeat(8,minmax(2.75rem,1fr))] gap-x-1";

export function OdontogramGrid({
  teeth,
  selectedTooth,
  readOnly,
  canPaint,
  onSelectTooth,
}: {
  teeth: ToothRecord[];
  selectedTooth: number | null;
  readOnly: boolean;
  canPaint: boolean;
  onSelectTooth: (num: number) => void;
}) {
  const cellProps = { teeth, selectedTooth, readOnly, canPaint, onSelect: onSelectTooth };

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm sm:p-6">
      <div className="mx-auto min-w-[52rem] max-w-6xl space-y-2">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Верхняя челюсть
        </p>

        <div className={cn(ARCH_GRID, "items-end")}>
          {UPPER_RIGHT_TEETH.map((num) => (
            <ToothCell key={num} num={num} jaw="upper" {...cellProps} />
          ))}
          <div className="bg-slate-300" aria-hidden />
          {UPPER_LEFT_TEETH.map((num) => (
            <ToothCell key={num} num={num} jaw="upper" {...cellProps} />
          ))}
        </div>

        <div className="border-t border-dashed border-slate-300" />

        <div className={cn(ARCH_GRID, "items-start")}>
          {LOWER_RIGHT_TEETH.map((num) => (
            <ToothCell key={num} num={num} jaw="lower" {...cellProps} />
          ))}
          <div className="bg-slate-300" aria-hidden />
          {LOWER_LEFT_TEETH.map((num) => (
            <ToothCell key={num} num={num} jaw="lower" {...cellProps} />
          ))}
        </div>

        <p className="text-center text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Нижняя челюсть
        </p>
      </div>
    </div>
  );
}
