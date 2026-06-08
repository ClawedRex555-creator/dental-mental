import type { Service } from "./types";
import { serviceNotes } from "./utils";

export const SERVICE_CATEGORIES = [
  "Терапия",
  "Ортопедия",
  "Хирургия",
  "Имплантация и протезирование",
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
  имплантация: "Имплантация и протезирование",
  "имплантация и протезирование": "Имплантация и протезирование",
  имплантология: "Имплантация и протезирование",
  импланты: "Имплантация и протезирование",
  "ортопедия и имплантация": "Имплантация и протезирование",
  "протезирование и имплантация": "Имплантация и протезирование",
  /** Отдельное «протезирование» без импланта — ортопедия */
  протезирование: "Ортопедия",
  "несъемное протезирование": "Ортопедия",
  "съемное протезирование": "Ортопедия",
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
  if (lower.includes("имплант") && !lower.includes("хирург")) {
    return "Имплантация и протезирование";
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

/** Нормализация полей услуги без смены категории по названию */
export function normalizeServiceFields(service: Service): Service {
  return {
    ...service,
    category: normalizeServiceCategory(service.category),
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
