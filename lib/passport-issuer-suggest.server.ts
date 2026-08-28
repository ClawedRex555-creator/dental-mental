import "server-only";

const DADATA_FMS_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/fms_unit";

export type PassportIssuerSuggestion = {
  name: string;
  code: string;
};

type DaDataFmsResponse = {
  suggestions?: Array<{
    value?: string;
    unrestricted_value?: string;
    data?: { code?: string; name?: string };
  }>;
};

export function isDaDataPassportIssuerSuggestConfigured(): boolean {
  return Boolean(process.env.DADATA_API_TOKEN?.trim());
}

/** Нормализация кода подразделения до XXX-XXX или пустой строки. */
export function normalizePassportIssuerCodeQuery(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 6) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/** Подсказка ФМС по коду подразделения. Без токена / неполного кода — null. */
export async function suggestPassportIssuerViaDaData(
  codeRaw: string
): Promise<PassportIssuerSuggestion | null> {
  const token = process.env.DADATA_API_TOKEN?.trim();
  if (!token) return null;

  const code = normalizePassportIssuerCodeQuery(codeRaw);
  if (!code) return null;

  const res = await fetch(DADATA_FMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      query: code,
      count: 1,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn("[passport-issuer-suggest] DaData HTTP", res.status);
    return null;
  }

  const data = (await res.json()) as DaDataFmsResponse;
  const first = data.suggestions?.[0];
  if (!first) return null;

  const name = (first.data?.name ?? first.value ?? first.unrestricted_value ?? "").trim();
  const resolvedCode = (first.data?.code ?? code).trim() || code;
  if (!name) return null;

  return { name, code: resolvedCode };
}
