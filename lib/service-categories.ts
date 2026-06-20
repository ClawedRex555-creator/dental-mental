import type { Service, WorkActItem } from "./types";
import { serviceNotes } from "./utils";

export const SERVICE_CATEGORY_IMPLANTATION = "Имплантация";
export const SERVICE_CATEGORY_PROSTHETICS = "Протезирование";
/** @deprecated миграция в Имплантация / Протезирование */
export const LEGACY_IMPLANT_PROSTHETICS_CATEGORY = "Имплантация и протезирование";

export const SERVICE_CATEGORIES = [
  "Терапия",
  "Ортопедия",
  "Хирургия",
  SERVICE_CATEGORY_IMPLANTATION,
  SERVICE_CATEGORY_PROSTHETICS,
  "Детская стоматология",
  "Ортодонтия",
  "Диагностика и вспомогательные услуги",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

const CANONICAL_BY_LOWER = new Map<string, ServiceCategory>(
  SERVICE_CATEGORIES.map((c) => [c.toLowerCase(), c])
);

/** Старые/ручные названия категорий → актуальные из прайса */
const CATEGORY_ALIASES: Record<string, ServiceCategory> = {
  терапия: "Терапия",
  ортопедия: "Ортопедия",
  ортопедическое: "Ортопедия",
  хирургия: "Хирургия",
  хирургическое: "Хирургия",
  "хирургия и имплантация": "Хирургия",
  "имплантация и хирургия": "Хирургия",
  имплантация: SERVICE_CATEGORY_IMPLANTATION,
  [LEGACY_IMPLANT_PROSTHETICS_CATEGORY.toLowerCase()]: SERVICE_CATEGORY_IMPLANTATION,
  имплантология: SERVICE_CATEGORY_IMPLANTATION,
  импланты: SERVICE_CATEGORY_IMPLANTATION,
  "ортопедия и имплантация": SERVICE_CATEGORY_IMPLANTATION,
  "протезирование и имплантация": SERVICE_CATEGORY_PROSTHETICS,
  протезирование: SERVICE_CATEGORY_PROSTHETICS,
  "несъемное протезирование": SERVICE_CATEGORY_PROSTHETICS,
  "съемное протезирование": SERVICE_CATEGORY_PROSTHETICS,
  диагностика: "Диагностика и вспомогательные услуги",
  "диагностика и вспомогательные услуги": "Диагностика и вспомогательные услуги",
  "вспомогательные услуги": "Диагностика и вспомогательные услуги",
  вспомогательные: "Диагностика и вспомогательные услуги",
  рентген: "Диагностика и вспомогательные услуги",
  рентгенология: "Диагностика и вспомогательные услуги",
  снимки: "Диагностика и вспомогательные услуги",
  "кт и диагностика": "Диагностика и вспомогательные услуги",
  "детская стоматология": "Детская стоматология",
  ортодонтия: "Ортодонтия",
};

function coerceServicePrice(price: unknown): number {
  if (typeof price === "number" && Number.isFinite(price)) return price;
  if (typeof price === "string") {
    const n = Number(price.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function findCanonicalCategory(category: string): ServiceCategory | null {
  return CANONICAL_BY_LOWER.get(category.toLowerCase()) ?? null;
}

/** Приводит категорию к справочнику (не смотрит на название услуги) */
export function normalizeServiceCategory(category: string | undefined): string {
  const trimmed = category?.trim();
  if (!trimmed) return SERVICE_CATEGORIES[0];

  const canonical = findCanonicalCategory(trimmed);
  if (canonical) return canonical;

  const alias = CATEGORY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const lower = trimmed.toLowerCase();
  if (lower.includes("хирург")) return "Хирургия";
  if (lower.includes("ортопед") && !lower.includes("имплант")) return "Ортопедия";
  if (lower.includes("протез") && !lower.includes("хирург")) {
    return SERVICE_CATEGORY_PROSTHETICS;
  }
  if (lower.includes("имплант") && !lower.includes("хирург")) {
    return SERVICE_CATEGORY_IMPLANTATION;
  }
  if (
    lower.includes("диагност") ||
    lower.includes("вспомогат") ||
    lower.includes("рентген") ||
    lower.includes("снимок") ||
    lower.includes("кт ")
  ) {
    return "Диагностика и вспомогательные услуги";
  }

  return trimmed;
}

export function isKnownServiceCategory(category: string): boolean {
  return findCanonicalCategory(category) !== null;
}

/** Нормализация полей услуги; старая объединённая категория делится по названию услуги */
export function normalizeServiceFields(service: Service): Service {
  const raw = service.category?.trim() ?? "";
  const category =
    raw === LEGACY_IMPLANT_PROSTHETICS_CATEGORY
      ? splitLegacyImplantProstheticsCategory(service.name)
      : normalizeServiceCategory(service.category);
  return {
    ...service,
    category,
    price: coerceServicePrice(service.price),
  };
}

/** @deprecated используйте normalizeServiceFields */
export function migrateServices(services: Service[]): Service[] {
  return services.map(normalizeServiceFields);
}

/**
 * Объединение прайсов: услуги из local (текущая сессия) не затираются remote-снимком.
 */
export function mergeClinicServices(remote: Service[], local: Service[]): Service[] {
  const map = new Map<string, Service>();

  for (const s of remote.map(normalizeServiceFields)) {
    map.set(s.id, s);
  }
  for (const s of local.map(normalizeServiceFields)) {
    map.set(s.id, s);
  }

  return Array.from(map.values());
}

function matchesServiceSearch(service: Service, q: string): boolean {
  if (!q) return true;
  const note = serviceNotes(service)?.toLowerCase() ?? "";
  return (
    service.name.toLowerCase().includes(q) ||
    service.category.toLowerCase().includes(q) ||
    note.includes(q) ||
    String(service.price).includes(q)
  );
}

/** Группировка для страницы «Услуги» */
export function groupServicesByCategory(
  services: Service[],
  searchQuery = ""
): { category: string; items: Service[]; isLegacyCategory?: boolean }[] {
  const q = searchQuery.trim().toLowerCase();
  const byCategory = new Map<string, Service[]>();

  for (const raw of services) {
    const service = normalizeServiceFields(raw);
    if (!matchesServiceSearch(service, q)) continue;
    const list = byCategory.get(service.category) ?? [];
    list.push(service);
    byCategory.set(service.category, list);
  }

  const groups: { category: string; items: Service[]; isLegacyCategory?: boolean }[] = [];

  for (const category of SERVICE_CATEGORIES) {
    groups.push({ category, items: byCategory.get(category) ?? [] });
    byCategory.delete(category);
  }

  for (const [category, items] of byCategory) {
    if (items.length > 0) {
      groups.push({ category, items, isLegacyCategory: true });
    }
  }

  return groups;
}

/** Разделение старой объединённой категории по названию услуги */
export function splitLegacyImplantProstheticsCategory(serviceName: string): ServiceCategory {
  const lower = serviceName.toLowerCase();
  if (
    lower.includes("коронк") ||
    lower.includes("абатмент") ||
    lower.includes("винир") ||
    (lower.includes("протез") && !lower.includes("имплант"))
  ) {
    return SERVICE_CATEGORY_PROSTHETICS;
  }
  return SERVICE_CATEGORY_IMPLANTATION;
}

export function isImplantationServiceCategory(category: string | undefined): boolean {
  if (!category?.trim()) return false;
  const normalized = normalizeServiceCategory(category);
  if (normalized === SERVICE_CATEGORY_IMPLANTATION) return true;
  if (normalized === LEGACY_IMPLANT_PROSTHETICS_CATEGORY) return true;
  return false;
}

/** Категория услуги для расчёта комиссии (с учётом legacy и serviceId) */
export function resolveCommissionServiceCategory(
  item: Pick<WorkActItem, "serviceId" | "serviceCategory" | "serviceName">,
  services: Service[]
): string {
  if (item.serviceCategory?.trim()) {
    const cat = item.serviceCategory.trim();
    if (cat === LEGACY_IMPLANT_PROSTHETICS_CATEGORY) {
      return splitLegacyImplantProstheticsCategory(item.serviceName);
    }
    return normalizeServiceCategory(cat);
  }
  const svc = item.serviceId ? services.find((s) => s.id === item.serviceId) : undefined;
  if (svc) {
    const cat = normalizeServiceFields(svc).category;
    if (cat === LEGACY_IMPLANT_PROSTHETICS_CATEGORY) {
      return splitLegacyImplantProstheticsCategory(svc.name);
    }
    return cat;
  }
  return normalizeServiceCategory(item.serviceName);
}
