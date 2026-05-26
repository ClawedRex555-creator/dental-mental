"use client";

import type { ToothCondition } from "@/lib/types";
import type { ToothShape } from "@/lib/tooth-shapes";
import { getToothShape } from "@/lib/tooth-shapes";
import { cn } from "@/lib/utils";

export type { ToothShape } from "@/lib/tooth-shapes";
export { getToothShape } from "@/lib/tooth-shapes";

const ENAMEL: Record<ToothCondition, string> = {
  healthy: "#f8fafc",
  caries: "#fde68a",
  filled: "#bae6fd",
  crown: "#ddd6fe",
  implant: "#a5f3fc",
  missing: "#e2e8f0",
  root_treatment: "#fed7aa",
  extraction_needed: "#fecaca",
};

const ROOT: Record<ToothCondition, string> = {
  healthy: "#e2e8f0",
  caries: "#d6d3d1",
  filled: "#cbd5e1",
  crown: "#c4b5fd",
  implant: "#67e8f9",
  missing: "#cbd5e1",
  root_treatment: "#fdba74",
  extraction_needed: "#fca5a5",
};

const STROKE: Record<ToothCondition, string> = {
  healthy: "#94a3b8",
  caries: "#d97706",
  filled: "#0284c7",
  crown: "#7c3aed",
  implant: "#0891b2",
  missing: "#94a3b8",
  root_treatment: "#ea580c",
  extraction_needed: "#dc2626",
};

interface ToothIconProps {
  number: number;
  condition?: ToothCondition;
  jaw?: "upper" | "lower";
  size?: "sm" | "md" | "lg";
  className?: string;
}

function ToothBody({
  shape,
  condition,
  flip,
}: {
  shape: ToothShape;
  condition: ToothCondition;
  flip: boolean;
}) {
  const enamel = ENAMEL[condition];
  const root = ROOT[condition];
  const stroke = STROKE[condition];
  const missing = condition === "missing";
  const implant = condition === "implant";
  const crown = condition === "crown";

  const gProps = flip ? { transform: "scale(1,-1) translate(0,-44)" } : {};

  if (missing) {
    return (
      <g {...gProps}>
        <rect x="6" y="8" width="20" height="28" rx="4" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="10" y1="12" x2="22" y2="32" stroke={stroke} strokeWidth="1.2" />
        <line x1="22" y1="12" x2="10" y2="32" stroke={stroke} strokeWidth="1.2" />
      </g>
    );
  }

  if (shape === "incisor") {
    return (
      <g {...gProps}>
        {implant && (
          <path d="M14 26 L16 38 L18 26 Z" fill="#64748b" stroke="#475569" strokeWidth="0.6" />
        )}
        <path
          d="M16 3 C20 3 23 6 23.5 11 C24 15 23 20 21.5 26 C20.5 31 18.5 35 16 36 C13.5 35 11.5 31 10.5 26 C9 20 8 15 8.5 11 C9 6 12 3 16 3 Z"
          fill={enamel}
          stroke={stroke}
          strokeWidth="1"
        />
        <path
          d="M13 10 C13 8 14.5 7 16 7 C17.5 7 19 8 19 10 C19 12 17.5 13.5 16 13.5 C14.5 13.5 13 12 13 10 Z"
          fill="rgba(255,255,255,0.55)"
          stroke="rgba(148,163,184,0.5)"
          strokeWidth="0.4"
        />
        {!implant && (
          <path
            d="M14 26 C14 30 15 33 16 34 C17 33 18 30 18 26"
            fill={root}
            stroke={stroke}
            strokeWidth="0.5"
          />
        )}
        {crown && (
          <path
            d="M11 8 C11 4 13 2 16 2 C19 2 21 4 21 8 L20 14 C19 16 17 17 16 17 C15 17 13 16 12 14 Z"
            fill="#c4b5fd"
            stroke="#7c3aed"
            strokeWidth="0.8"
          />
        )}
      </g>
    );
  }

  if (shape === "canine") {
    return (
      <g {...gProps}>
        {implant && (
          <path d="M14 24 L16 38 L18 24 Z" fill="#64748b" stroke="#475569" strokeWidth="0.6" />
        )}
        <path
          d="M16 2 C19 2 22 5 23 10 C23.5 14 22.5 18 21 23 C19.5 28 18 32 16 36 C14 32 12.5 28 11 23 C9.5 18 8.5 14 9 10 C10 5 13 2 16 2 Z"
          fill={enamel}
          stroke={stroke}
          strokeWidth="1"
        />
        <path d="M16 6 L18 12 L16 16 L14 12 Z" fill="rgba(255,255,255,0.45)" />
        {!implant && (
          <path d="M14 24 C14.5 29 15.5 33 16 34 C16.5 33 17.5 29 18 24" fill={root} stroke={stroke} strokeWidth="0.5" />
        )}
        {crown && (
          <path
            d="M12 7 C12 3 14 1 16 1 C18 1 20 3 20 7 L19.5 13 C18.5 15 17 16 16 16 C15 16 13.5 15 12.5 13 Z"
            fill="#c4b5fd"
            stroke="#7c3aed"
            strokeWidth="0.8"
          />
        )}
      </g>
    );
  }

  if (shape === "premolar") {
    return (
      <g {...gProps}>
        {implant && (
          <path d="M13 22 L16 38 L19 22 Z" fill="#64748b" stroke="#475569" strokeWidth="0.6" />
        )}
        <path
          d="M16 3 C21 3 25 7 25.5 12 C26 16 25 21 23 26 C21.5 31 19 35 16 36 C13 35 10.5 31 9 26 C7 21 6 16 6.5 12 C7 7 11 3 16 3 Z"
          fill={enamel}
          stroke={stroke}
          strokeWidth="1"
        />
        <ellipse cx="12.5" cy="11" rx="2.2" ry="2.5" fill="rgba(255,255,255,0.5)" />
        <ellipse cx="19.5" cy="11" rx="2.2" ry="2.5" fill="rgba(255,255,255,0.45)" />
        <path d="M14 8 C16 10 18 8" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="0.6" />
        {!implant && (
          <path d="M13 24 C13.5 29 14.5 33 16 34 C17.5 33 18.5 29 19 24" fill={root} stroke={stroke} strokeWidth="0.5" />
        )}
        {crown && (
          <path
            d="M10 9 C10 4 12 2 16 2 C20 2 22 4 22 9 L21 15 C20 17 18 18 16 18 C14 18 12 17 11 15 Z"
            fill="#c4b5fd"
            stroke="#7c3aed"
            strokeWidth="0.8"
          />
        )}
      </g>
    );
  }

  // molar
  return (
    <g {...gProps}>
      {implant && (
        <path d="M12 20 L16 38 L20 20 Z" fill="#64748b" stroke="#475569" strokeWidth="0.6" />
      )}
      <path
        d="M16 2 C23 2 28 6 28.5 12 C29 17 27.5 22 25.5 27 C23.5 32 20 35 16 36 C12 35 8.5 32 6.5 27 C4.5 22 3 17 3.5 12 C4 6 9 2 16 2 Z"
        fill={enamel}
        stroke={stroke}
        strokeWidth="1"
      />
      <ellipse cx="11" cy="10" rx="2.5" ry="2.8" fill="rgba(255,255,255,0.5)" />
      <ellipse cx="16" cy="9" rx="2.2" ry="2.5" fill="rgba(255,255,255,0.45)" />
      <ellipse cx="21" cy="10" rx="2.5" ry="2.8" fill="rgba(255,255,255,0.4)" />
      <path
        d="M11 14 C13 16 15 15 16 15 C17 15 19 16 21 14"
        fill="none"
        stroke="rgba(148,163,184,0.3)"
        strokeWidth="0.5"
      />
      {!implant && (
        <path
          d="M12 22 C12 28 14 32 16 33 C18 32 20 28 20 22"
          fill={root}
          stroke={stroke}
          strokeWidth="0.5"
        />
      )}
      {crown && (
        <path
          d="M9 10 C9 4 11 1 16 1 C21 1 23 4 23 10 L22 16 C21 18 18.5 19 16 19 C13.5 19 11 18 10 16 Z"
          fill="#c4b5fd"
          stroke="#7c3aed"
          strokeWidth="0.8"
        />
      )}
    </g>
  );
}

const SIZE_CLASS = {
  lg: {
    molar: "w-12 h-[4.25rem]",
    premolar: "w-11 h-16",
    other: "w-9 h-16",
  },
  md: {
    molar: "w-10 h-14",
    premolar: "w-9 h-12",
    other: "w-7 h-12",
  },
  sm: {
    molar: "w-8 h-10",
    premolar: "w-7 h-9",
    other: "w-6 h-9",
  },
} as const;

const NUMBER_FONT: Record<"sm" | "md" | "lg", number> = {
  sm: 8,
  md: 9,
  lg: 11,
};

export function ToothIcon({
  number,
  condition = "healthy",
  jaw = "upper",
  size = "md",
  className,
}: ToothIconProps) {
  const shape = getToothShape(number);
  const flip = jaw === "upper";
  const bucket = SIZE_CLASS[size];
  const dim =
    shape === "molar" ? bucket.molar : shape === "premolar" ? bucket.premolar : bucket.other;

  return (
    <svg
      viewBox="0 0 32 44"
      className={cn(dim, "shrink-0 drop-shadow-sm", className)}
      aria-hidden
    >
      <ToothBody shape={shape} condition={condition} flip={flip} />
      <text
        x="16"
        y={flip ? "6" : "40"}
        textAnchor="middle"
        className="fill-slate-700 font-bold"
        style={{ fontSize: NUMBER_FONT[size] }}
      >
        {number}
      </text>
    </svg>
  );
}
