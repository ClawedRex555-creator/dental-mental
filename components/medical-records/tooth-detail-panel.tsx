"use client";

import { useState } from "react";
import type { ToothCondition, ToothRecord, ToothSurface, ToothTreatmentStatus } from "@/lib/types";
import {
  TOOTH_CONDITION_COLORS,
  TOOTH_CONDITION_LABELS,
  TOOTH_TREATMENT_STATUS_LABELS,
} from "@/lib/constants";
import {
  formatConditionsList,
  getSurfaceConditions,
  TOOTH_SURFACE_LABELS,
  toggleSurfaceCondition,
} from "@/lib/tooth-record-utils";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

const TREATMENT_STATUSES: ToothTreatmentStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
];

type ToothDraft = {
  diagnosis: string;
  plannedTreatment: string;
  completedTreatment: string;
  price: string;
  status: ToothTreatmentStatus;
};

function draftFromTooth(tooth?: ToothRecord): ToothDraft {
  return {
    diagnosis: tooth?.diagnosis ?? "",
    plannedTreatment: tooth?.plannedTreatment ?? "",
    completedTreatment: tooth?.completedTreatment ?? "",
    price: tooth?.price != null ? String(tooth.price) : "",
    status: tooth?.status ?? "planned",
  };
}

function SurfaceEditor({
  surface,
  conditions,
  readOnly,
  onToggle,
}: {
  surface: ToothSurface;
  conditions: ToothCondition[];
  readOnly: boolean;
  onToggle: (c: ToothCondition) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
      <p className="text-xs font-semibold text-[var(--foreground)]">
        {TOOTH_SURFACE_LABELS[surface]}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CONDITIONS.map((c) => {
          const active = conditions.includes(c);
          return (
            <button
              key={c}
              type="button"
              disabled={readOnly}
              onClick={() => onToggle(c)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all",
                TOOTH_CONDITION_COLORS[c],
                active && "ring-2 ring-teal-600 ring-offset-1",
                readOnly && "opacity-60"
              )}
            >
              {TOOTH_CONDITION_LABELS[c]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--muted)]">{formatConditionsList(conditions)}</p>
    </div>
  );
}

interface ToothDetailPanelProps {
  toothNumber: number;
  tooth?: ToothRecord;
  readOnly: boolean;
  onSaveSurfaces: (surface: ToothSurface, conditions: ToothCondition[]) => void;
  onSaveDetails: (patch: Partial<ToothRecord>) => void;
}

function ToothDetailPanelContent({
  toothNumber,
  tooth,
  readOnly,
  onSaveSurfaces,
  onSaveDetails,
}: ToothDetailPanelProps) {
  const [draft, setDraft] = useState<ToothDraft>(() => draftFromTooth(tooth));

  const commitDraft = () => {
    if (readOnly) return;
    onSaveDetails({
      diagnosis: draft.diagnosis.trim() || undefined,
      plannedTreatment: draft.plannedTreatment.trim() || undefined,
      completedTreatment: draft.completedTreatment.trim() || undefined,
      price: draft.price ? Number(draft.price) || undefined : undefined,
      status: draft.status,
    });
  };

  const toggleSurface = (surface: ToothSurface, condition: ToothCondition) => {
    if (!tooth) {
      onSaveSurfaces(surface, condition === "healthy" ? ["healthy"] : [condition]);
      return;
    }
    const current = getSurfaceConditions(tooth, surface);
    onSaveSurfaces(surface, toggleSurfaceCondition(current, condition));
  };

  return (
    <div className="space-y-4">
      <SurfaceEditor
        key={`${toothNumber}-vest`}
        surface="vestibular"
        conditions={getSurfaceConditions(tooth, "vestibular")}
        readOnly={readOnly}
        onToggle={(c) => toggleSurface("vestibular", c)}
      />
      <SurfaceEditor
        key={`${toothNumber}-ling`}
        surface="lingual"
        conditions={getSurfaceConditions(tooth, "lingual")}
        readOnly={readOnly}
        onToggle={(c) => toggleSurface("lingual", c)}
      />

      <div className="space-y-2">
        <Label>Диагноз (текст)</Label>
        <Input
          key={`${toothNumber}-diagnosis`}
          disabled={readOnly}
          value={draft.diagnosis}
          onChange={(e) => setDraft((d) => ({ ...d, diagnosis: e.target.value }))}
          onBlur={commitDraft}
          placeholder="K02.1, K04.0…"
        />
      </div>
      <div className="space-y-2">
        <Label>Запланированное лечение</Label>
        <Textarea
          key={`${toothNumber}-planned`}
          disabled={readOnly}
          value={draft.plannedTreatment}
          onChange={(e) => setDraft((d) => ({ ...d, plannedTreatment: e.target.value }))}
          onBlur={commitDraft}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Выполненное лечение</Label>
        <Textarea
          key={`${toothNumber}-completed`}
          disabled={readOnly}
          value={draft.completedTreatment}
          onChange={(e) => setDraft((d) => ({ ...d, completedTreatment: e.target.value }))}
          onBlur={commitDraft}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Стоимость</Label>
          <Input
            key={`${toothNumber}-price`}
            disabled={readOnly}
            type="number"
            value={draft.price}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
            onBlur={commitDraft}
          />
        </div>
        <div className="space-y-2">
          <Label>Статус лечения</Label>
          <select
            disabled={readOnly}
            value={draft.status}
            onChange={(e) => {
              const status = e.target.value as ToothTreatmentStatus;
              setDraft((d) => ({ ...d, status }));
              onSaveDetails({ status });
            }}
            className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
          >
            {TREATMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOOTH_TREATMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!readOnly && (
        <Button type="button" size="sm" className="w-full" onClick={commitDraft}>
          Сохранить данные зуба
        </Button>
      )}

      {draft.price && Number(draft.price) > 0 && (
        <p className="text-sm font-medium text-teal-700">
          Итого: {formatCurrency(Number(draft.price))}
        </p>
      )}
    </div>
  );
}

export function ToothDetailPanel(props: ToothDetailPanelProps) {
  return <ToothDetailPanelContent key={props.toothNumber} {...props} />;
}
