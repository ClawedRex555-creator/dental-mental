import { TOOTH_CONDITION_LABELS, TOOTH_TREATMENT_STATUS_LABELS } from "@/lib/constants";
import type { ToothCondition, ToothRecord, ToothSurface } from "@/lib/types";

export const TOOTH_SURFACES: ToothSurface[] = ["vestibular", "lingual"];

export const TOOTH_SURFACE_LABELS: Record<ToothSurface, string> = {
  vestibular: "Наружная (щёчная / губная)",
  lingual: "Внутренняя (язычная / нёбная)",
};

export const TOOTH_SURFACE_SHORT: Record<ToothSurface, string> = {
  vestibular: "Нар.",
  lingual: "Внутр.",
};

/** Приводит запись зуба к новой схеме (две поверхности + списки диагнозов) */
export function normalizeToothRecord(tooth: ToothRecord): ToothRecord {
  const vestibular =
    tooth.vestibularConditions ??
    (tooth.condition && tooth.condition !== "healthy" ? [tooth.condition] : []);
  const lingual = tooth.lingualConditions ?? [];

  const vest: ToothCondition[] =
    vestibular.length > 0
      ? uniqueConditions(vestibular)
      : lingual.length > 0
        ? []
        : ["healthy"];

  return {
    ...tooth,
    vestibularConditions: vest,
    lingualConditions: uniqueConditions(lingual),
    condition: primaryCondition(vest, lingual, tooth.condition),
  };
}

export function normalizeTeethRecords(teeth: ToothRecord[]): ToothRecord[] {
  return teeth.map(normalizeToothRecord);
}

export function uniqueConditions(list: ToothCondition[]): ToothCondition[] {
  const seen = new Set<ToothCondition>();
  const out: ToothCondition[] = [];
  for (const c of list) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export function getSurfaceConditions(
  tooth: ToothRecord | undefined,
  surface: ToothSurface
): ToothCondition[] {
  if (!tooth) return [];
  const n = normalizeToothRecord(tooth);
  if (surface === "vestibular") {
    return n.vestibularConditions?.length
      ? n.vestibularConditions
      : n.condition
        ? [n.condition]
        : ["healthy"];
  }
  return n.lingualConditions ?? [];
}

export function primaryCondition(
  vestibular: ToothCondition[],
  lingual: ToothCondition[],
  fallback?: ToothCondition
): ToothCondition {
  const all = [...vestibular, ...lingual].filter((c) => c !== "healthy");
  if (all.length === 0) return fallback ?? "healthy";
  const priority: ToothCondition[] = [
    "extraction_needed",
    "missing",
    "implant",
    "crown",
    "root_treatment",
    "caries",
    "filled",
    "healthy",
  ];
  for (const p of priority) {
    if (all.includes(p)) return p;
  }
  return all[0];
}

export function mergeSurfaceConditions(
  existing: ToothCondition[],
  toAdd: ToothCondition[]
): ToothCondition[] {
  if (toAdd.length === 0) return existing;
  if (toAdd.includes("healthy")) return ["healthy"];
  const merged = existing.filter((c) => c !== "healthy");
  for (const c of toAdd) {
    if (c === "healthy") return ["healthy"];
    if (!merged.includes(c)) merged.push(c);
  }
  return merged.length ? uniqueConditions(merged) : ["healthy"];
}

export function toggleSurfaceCondition(
  existing: ToothCondition[],
  condition: ToothCondition
): ToothCondition[] {
  if (condition === "healthy") return ["healthy"];
  const has = existing.includes(condition);
  const withoutHealthy = existing.filter((c) => c !== "healthy");
  const next = has
    ? withoutHealthy.filter((c) => c !== condition)
    : [...withoutHealthy, condition];
  return next.length ? uniqueConditions(next) : ["healthy"];
}

export function patchToothSurfaces(
  tooth: ToothRecord,
  surface: ToothSurface,
  conditions: ToothCondition[]
): ToothRecord {
  const n = normalizeToothRecord(tooth);
  const patch =
    surface === "vestibular"
      ? { vestibularConditions: conditions }
      : { lingualConditions: conditions };
  const merged = { ...n, ...patch };
  return {
    ...merged,
    condition: primaryCondition(
      merged.vestibularConditions ?? [],
      merged.lingualConditions ?? [],
      merged.condition
    ),
  };
}

export function formatConditionsList(conditions: ToothCondition[]): string {
  const active = conditions.filter((c) => c !== "healthy");
  if (!active.length) return TOOTH_CONDITION_LABELS.healthy;
  return active.map((c) => TOOTH_CONDITION_LABELS[c]).join(", ");
}

/** Краткая сводка по зубу для подсказки при выборе */
export function formatToothBriefSummary(tooth: ToothRecord): string {
  const parts: string[] = [];
  parts.push(
    `${TOOTH_SURFACE_SHORT.vestibular} ${formatConditionsList(getSurfaceConditions(tooth, "vestibular"))}`
  );
  parts.push(
    `${TOOTH_SURFACE_SHORT.lingual} ${formatConditionsList(getSurfaceConditions(tooth, "lingual"))}`
  );
  if (tooth.status && tooth.status !== "planned") {
    parts.push(TOOTH_TREATMENT_STATUS_LABELS[tooth.status]);
  }
  const note = tooth.diagnosis?.trim();
  if (note) parts.push(note.length > 50 ? `${note.slice(0, 50)}…` : note);
  return parts.join(" · ");
}
