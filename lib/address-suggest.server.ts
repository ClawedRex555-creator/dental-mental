import "server-only";

import type { AddressSuggestion } from "@/lib/address-suggest";

const DADATA_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

type DaDataSuggestResponse = {
  suggestions?: Array<{ value?: string; unrestricted_value?: string }>;
};

export function isDaDataAddressSuggestConfigured(): boolean {
  return Boolean(process.env.DADATA_API_TOKEN?.trim());
}

/** Подсказки адресов через DaData Suggest. Без токена — пустой список. */
export async function suggestAddressesViaDaData(
  query: string,
  count = 8
): Promise<AddressSuggestion[]> {
  const token = process.env.DADATA_API_TOKEN?.trim();
  if (!token) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const res = await fetch(DADATA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      query: q,
      count: Math.min(Math.max(count, 1), 10),
      language: "ru",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn("[address-suggest] DaData HTTP", res.status);
    return [];
  }

  const data = (await res.json()) as DaDataSuggestResponse;
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of data.suggestions ?? []) {
    const value = (s.value ?? s.unrestricted_value ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, source: "dadata" });
  }
  return out;
}
