/** Подсказки адресов: локальные из базы клиники + опционально DaData. */

export type AddressSuggestion = {
  value: string;
  /** Откуда подсказка — для отладки / подписи в UI */
  source: "local" | "dadata";
};

export function normalizeAddressQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Уникальные непустые адреса из списка (порядок — по частоте, затем алфавит). */
export function collectKnownAddresses(addresses: Array<string | undefined | null>): string[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of addresses) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const key = normalizeAddressQuery(value);
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"))
    .map((x) => x.value);
}

/** Локальный фильтр по уже сохранённым адресам пациентов/клиники. */
export function filterKnownAddresses(
  known: string[],
  query: string,
  limit = 8
): AddressSuggestion[] {
  const q = normalizeAddressQuery(query);
  if (q.length < 2) return [];
  const out: AddressSuggestion[] = [];
  for (const value of known) {
    if (normalizeAddressQuery(value) === q) continue;
    if (!normalizeAddressQuery(value).includes(q)) continue;
    out.push({ value, source: "local" });
    if (out.length >= limit) break;
  }
  return out;
}

export function mergeAddressSuggestions(
  local: AddressSuggestion[],
  remote: AddressSuggestion[],
  limit = 8
): AddressSuggestion[] {
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const item of [...local, ...remote]) {
    const key = normalizeAddressQuery(item.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
