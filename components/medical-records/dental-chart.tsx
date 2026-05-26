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
  getSurfaceConditions,
  mergeSurfaceConditions,
  normalizeTeethRecords,
  normalizeToothRecord,
  patchToothSurfaces,
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
  const canPaint = !readOnly && paintConditions.length > 0;

  const pushTeeth = (next: ToothRecord[]) => {
    onUpdate(next.map(normalizeToothRecord));
  };

  const togglePaintCondition = (c: ToothCondition) => {
    setPaintConditions((prev) => {
      if (c === "healthy") return prev.includes("healthy") ? [] : ["healthy"];
      const withoutHealthy = prev.filter((x) => x !== "healthy");
      if (withoutHealthy.includes(c)) {
        return withoutHealthy.filter((x) => x !== c);
      }
      return [...withoutHealthy, c];
    });
  };

  const applyPaintToTooth = (toothNumber: number) => {
    if (paintConditions.length === 0) return;
    const existing = normalizedTeeth.find((t) => t.toothNumber === toothNumber);
    const base = existing ?? {
      toothNumber,
      condition: "healthy" as const,
      status: "planned" as const,
      vestibularConditions: ["healthy"],
      lingualConditions: [],
    };
    const current = getSurfaceConditions(base, paintSurface);
    const merged = mergeSurfaceConditions(current, paintConditions);
    const updated = patchToothSurfaces(base, paintSurface, merged);
    pushTeeth(upsertTooth(normalizedTeeth, updated));
    toast.success(
      `Зуб ${toothNumber} (${TOOTH_SURFACE_SHORT[paintSurface]}): ${formatConditionsList(merged)}`
    );
  };

  const handleSelectTooth = (num: number) => {
    if (num !== selectedTooth) {
      setPaintConditions([]);
    }
    if (canPaint) applyPaintToTooth(num);
    setSelectedTooth(num);
  };

  const ensureTooth = (toothNumber: number): ToothRecord => {
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
            Выберите сторону и диагнозы в легенде, затем нажмите на зуб. Можно отметить
            несколько диагнозов на одной поверхности.
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
                    onClick={() => setPaintSurface(s)}
                    className={cn(
                      "rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                      paintSurface === s
                        ? "border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-500"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-teal-300"
                    )}
                  >
                    {TOOTH_SURFACE_LABELS[s]}
                  </button>
                ))}
              </div>

              <p className="text-center text-sm text-[var(--muted)]">
                {paintConditions.length > 0
                  ? `К нанесению на ${TOOTH_SURFACE_SHORT[paintSurface].toLowerCase()}: ${paintConditions.map((c) => TOOTH_CONDITION_LABELS[c]).join(", ")}`
                  : "Легенда: нажмите цвет — можно выбрать несколько, затем кликните зуб"}
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
