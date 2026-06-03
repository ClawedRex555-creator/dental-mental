"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ToothCondition, ToothRecord, ToothSurface } from "@/lib/types";
import {
  TOOTH_CONDITION_COLORS,
  TOOTH_CONDITION_LABELS,
} from "@/lib/constants";
import {
  formatConditionsList,
  formatToothBriefSummary,
  getSurfaceConditions,
  normalizeTeethRecords,
  normalizeToothRecord,
  patchToothSurfaces,
  toggleSurfaceCondition,
  TOOTH_SURFACE_LABELS,
  TOOTH_SURFACE_SHORT,
  TOOTH_SURFACES,
} from "@/lib/tooth-record-utils";
import { OdontogramGrid } from "@/components/medical-records/odontogram-grid";
import { ToothDetailPanel } from "@/components/medical-records/tooth-detail-panel";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONDITIONS: ToothCondition[] = [
  "healthy",
  "caries",
  "filled",
  "crown",
  "implant",
  "missing",
  "root_treatment",
  "extraction_needed",
];

interface DentalChartProps {
  teeth: ToothRecord[];
  onUpdate: (teeth: ToothRecord[]) => void;
  readOnly?: boolean;
}

function upsertTooth(teeth: ToothRecord[], record: ToothRecord): ToothRecord[] {
  const exists = teeth.some((t) => t.toothNumber === record.toothNumber);
  if (exists) {
    return teeth.map((t) => (t.toothNumber === record.toothNumber ? record : t));
  }
  return [...teeth, record];
}

export function DentalChart({ teeth, onUpdate, readOnly = false }: DentalChartProps) {
  const normalizedTeeth = useMemo(() => normalizeTeethRecords(teeth), [teeth]);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [paintSurface, setPaintSurface] = useState<ToothSurface>("vestibular");
  const [paintConditions, setPaintConditions] = useState<ToothCondition[]>([]);

  const selected = normalizedTeeth.find((t) => t.toothNumber === selectedTooth);
  const canPaint = !readOnly && selectedTooth != null && paintConditions.length > 0;

  const pushTeeth = (next: ToothRecord[]) => {
    onUpdate(next.map(normalizeToothRecord));
  };

  const ensureToothRecord = (toothNumber: number): ToothRecord => {
    return (
      normalizedTeeth.find((t) => t.toothNumber === toothNumber) ?? {
        toothNumber,
        condition: "healthy",
        status: "planned",
        vestibularConditions: ["healthy"],
        lingualConditions: [],
      }
    );
  };

  const legendFromSurface = (toothNumber: number, surface: ToothSurface): ToothCondition[] => {
    const conds = getSurfaceConditions(ensureToothRecord(toothNumber), surface);
    return conds.includes("healthy") ? [] : conds;
  };

  const applyPaintToTooth = (toothNumber: number, conditions: ToothCondition[]) => {
    const base = ensureToothRecord(toothNumber);
    const updated = patchToothSurfaces(base, paintSurface, conditions);
    pushTeeth(upsertTooth(normalizedTeeth, updated));
    toast.success(
      `Зуб ${toothNumber} (${TOOTH_SURFACE_SHORT[paintSurface]}): ${formatConditionsList(conditions)}`
    );
  };

  const togglePaintCondition = (c: ToothCondition) => {
    if (selectedTooth == null) {
      toast.error("Сначала выберите зуб на схеме");
      return;
    }
    const base = ensureToothRecord(selectedTooth);
    const current = getSurfaceConditions(base, paintSurface);
    const next = toggleSurfaceCondition(current, c);
    applyPaintToTooth(selectedTooth, next);
    setPaintConditions(next.includes("healthy") ? [] : next);
  };

  const handleSelectTooth = (num: number) => {
    setSelectedTooth(num);
    setPaintConditions(legendFromSurface(num, paintSurface));
    const record = normalizeToothRecord(ensureToothRecord(num));
    toast.info(`Зуб ${num}: ${formatToothBriefSummary(record)}`, { duration: 5000 });
  };

  const handleSelectSurface = (surface: ToothSurface) => {
    setPaintSurface(surface);
    if (selectedTooth != null) {
      setPaintConditions(legendFromSurface(selectedTooth, surface));
    } else {
      setPaintConditions([]);
    }
  };

  const ensureTooth = ensureToothRecord;

  const saveSurfaces = (surface: ToothSurface, conditions: ToothCondition[]) => {
    if (!selectedTooth) return;
    pushTeeth(
      upsertTooth(normalizedTeeth, patchToothSurfaces(ensureTooth(selectedTooth), surface, conditions))
    );
  };

  const saveDetails = (patch: Partial<ToothRecord>) => {
    if (!selectedTooth) return;
    pushTeeth(
      upsertTooth(
        normalizedTeeth,
        normalizeToothRecord({ ...ensureTooth(selectedTooth), ...patch })
      )
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Зубная формула (FDI)</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            Выберите зуб, затем сторону и диагнозы — каждый клик по диагнозу сразу меняет
            выбранную сторону. При смене зуба легенда показывает его текущие отметки.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <OdontogramGrid
            teeth={normalizedTeeth}
            selectedTooth={selectedTooth}
            readOnly={readOnly}
            canPaint={canPaint}
            onSelectTooth={handleSelectTooth}
          />

          {!readOnly && (
            <div className="space-y-4 border-t border-[var(--border)] pt-5">
              <div className="flex flex-wrap justify-center gap-2">
                {TOOTH_SURFACES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectSurface(s)}
                    className={cn(
                      "rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                      paintSurface === s
                        ? "border-teal-500 bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] ring-1 ring-teal-500/60"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-teal-500/50"
                    )}
                  >
                    {TOOTH_SURFACE_LABELS[s]}
                  </button>
                ))}
              </div>

              <p className="text-center text-sm text-[var(--muted)]">
                {!selectedTooth
                  ? "Сначала выберите зуб на схеме"
                  : paintConditions.length > 0
                    ? `Зуб ${selectedTooth}, ${TOOTH_SURFACE_SHORT[paintSurface].toLowerCase()}: ${paintConditions.map((c) => TOOTH_CONDITION_LABELS[c]).join(", ")}`
                    : `Зуб ${selectedTooth} — нажмите диагноз для ${TOOTH_SURFACE_SHORT[paintSurface].toLowerCase()} стороны`}
              </p>

              <div className="flex flex-wrap justify-center gap-2.5">
                {CONDITIONS.map((c) => {
                  const active = paintConditions.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => togglePaintCondition(c)}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-medium transition-all",
                        TOOTH_CONDITION_COLORS[c],
                        active && "ring-2 ring-teal-600 ring-offset-2 scale-[1.02] shadow-sm"
                      )}
                    >
                      {active && <span className="mr-1.5 font-bold">✓</span>}
                      {TOOTH_CONDITION_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle className="text-base">
            {selectedTooth ? `Зуб ${selectedTooth}` : "Выберите зуб"}
          </CardTitle>
          {selected && (
            <div className="space-y-1 text-sm text-[var(--muted)]">
              <p>
                {TOOTH_SURFACE_SHORT.vestibular}:{" "}
                {formatConditionsList(getSurfaceConditions(selected, "vestibular"))}
              </p>
              <p>
                {TOOTH_SURFACE_SHORT.lingual}:{" "}
                {formatConditionsList(getSurfaceConditions(selected, "lingual"))}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selectedTooth == null ? (
            <p className="text-sm text-[var(--muted)]">
              Нажмите на зуб в схеме. Диагнозы по сторонам можно править и в карточке
              зуба.
            </p>
          ) : (
            <ToothDetailPanel
              key={selectedTooth}
              toothNumber={selectedTooth}
              tooth={selected}
              readOnly={readOnly}
              onSaveSurfaces={saveSurfaces}
              onSaveDetails={saveDetails}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
