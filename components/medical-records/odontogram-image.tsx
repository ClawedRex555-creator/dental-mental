"use client";

import { useState } from "react";
import { ODONTOGRAM_HOTSPOTS, type ToothHotspot } from "@/lib/odontogram-layout";
import type { ToothCondition } from "@/lib/types";
import {
  getSurfaceConditions,
  TOOTH_SURFACE_SHORT,
} from "@/lib/tooth-record-utils";
import type { ToothRecord, ToothSurface } from "@/lib/types";
import { TOOTH_CONDITION_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const RING_COLOR: Record<ToothCondition, string> = {
  healthy: "ring-emerald-400/0",
  caries: "ring-amber-500",
  filled: "ring-sky-500",
  crown: "ring-violet-500",
  implant: "ring-cyan-600",
  missing: "ring-slate-400",
  root_treatment: "ring-orange-500",
  extraction_needed: "ring-red-500",
};

type MarkedToothCondition = Exclude<ToothCondition, "healthy">;

function primaryRing(vest: ToothCondition[], ling: ToothCondition[]): string {
  const all: MarkedToothCondition[] = [...vest, ...ling].filter(
    (c): c is MarkedToothCondition => c !== "healthy"
  );
  if (!all.length) return "";
  const order: MarkedToothCondition[] = [
    "extraction_needed",
    "missing",
    "caries",
    "root_treatment",
    "crown",
    "implant",
    "filled",
  ];
  for (const p of order) {
    if (all.includes(p)) return RING_COLOR[p];
  }
  return RING_COLOR[all[0]];
}

function Hotspot({
  hotspot,
  tooth,
  selected,
  readOnly,
  canPaint,
  onClick,
}: {
  hotspot: ToothHotspot;
  tooth?: ToothRecord;
  selected: boolean;
  readOnly: boolean;
  canPaint: boolean;
  onClick: () => void;
}) {
  const vest = getSurfaceConditions(tooth, "vestibular");
  const ling = getSurfaceConditions(tooth, "lingual");
  const hasMarks = [...vest, ...ling].some((c) => c !== "healthy");
  const ring = primaryRing(vest, ling);

  const title = [
    `Зуб ${hotspot.number}`,
    vest.length ? `${TOOTH_SURFACE_SHORT.vestibular}: ${vest.map((c) => TOOTH_CONDITION_LABELS[c]).join(", ")}` : "",
    ling.length ? `${TOOTH_SURFACE_SHORT.lingual}: ${ling.map((c) => TOOTH_CONDITION_LABELS[c]).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "absolute rounded-sm border-0 bg-transparent p-0 transition-shadow",
        canPaint && "cursor-crosshair",
        selected && "ring-2 ring-teal-500 ring-offset-1 z-10",
        !selected && hasMarks && ring && `ring-2 ${ring} ring-offset-0`,
        !selected && !hasMarks && "hover:ring-2 hover:ring-teal-300/70 hover:ring-offset-0"
      )}
      style={{
        left: `${hotspot.left}%`,
        top: `${hotspot.top}%`,
        width: `${hotspot.width}%`,
        height: `${hotspot.height}%`,
      }}
    />
  );
}

export function OdontogramImage({
  teeth,
  selectedTooth,
  readOnly,
  paintSurface,
  paintConditions,
  onSelectTooth,
}: {
  teeth: ToothRecord[];
  selectedTooth: number | null;
  readOnly: boolean;
  paintSurface: ToothSurface;
  paintConditions: ToothCondition[];
  onSelectTooth: (num: number) => void;
}) {
  const sources = ["/dental/odontogram.png", "/api/odontogram"] as const;
  const [srcIndex, setSrcIndex] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  const canPaint = !readOnly && paintConditions.length > 0;

  const handleImgError = () => {
    if (srcIndex < sources.length - 1) {
      setSrcIndex((i) => i + 1);
      return;
    }
    setImgOk(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={sources[srcIndex]}
          src={sources[srcIndex]}
          alt="Зубная формула FDI"
          className={cn(
            "mx-auto block h-auto w-full select-none",
            !imgOk && "hidden"
          )}
          draggable={false}
          onLoad={() => setImgOk(true)}
          onError={handleImgError}
        />

        {!imgOk && (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">
            <p className="font-medium">Не найдена картинка схемы</p>
            <p className="mt-2 text-xs">
              Положите <strong>i.jpg</strong> в{" "}
              <code className="rounded bg-slate-100 px-1">public/dental/odontogram.png</code>
            </p>
            <p className="mt-1 text-xs">или запустите: node scripts/copy-odontogram.mjs</p>
          </div>
        )}

        {imgOk && (
          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-auto absolute inset-0">
              {ODONTOGRAM_HOTSPOTS.map((hotspot) => (
                <Hotspot
                  key={hotspot.number}
                  hotspot={hotspot}
                  tooth={teeth.find((t) => t.toothNumber === hotspot.number)}
                  selected={selectedTooth === hotspot.number}
                  readOnly={readOnly}
                  canPaint={canPaint}
                  onClick={() => onSelectTooth(hotspot.number)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {!readOnly && canPaint && (
        <p className="mt-3 text-center text-xs text-teal-700">
          Нажмите на зуб на схеме ({TOOTH_SURFACE_SHORT[paintSurface]})
        </p>
      )}
    </div>
  );
}
