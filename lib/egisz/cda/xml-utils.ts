/** Утилиты для сборки CDA XML */

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function nonEmpty(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** HL7 TS: YYYYMMDDHHMM+ZZZZ */
export function formatCdaEffectiveTime(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const stamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `${stamp}${sign}${hh}${mm}`;
}

/** HL7 TS date only: YYYYMMDD */
export function formatCdaDate(dateIso: string): string {
  return dateIso.slice(0, 10).replace(/-/g, "");
}

export function buildPersonnelIdRoot(
  organizationOid: string,
  misNumber = 1,
  misInstance = 1
): string {
  return buildMisIdRoot(organizationOid, "70", misNumber, misInstance);
}

export function buildMisIdRoot(
  organizationOid: string,
  suffix: string,
  misNumber = 1,
  misInstance = 1
): string {
  return `${organizationOid.trim()}.100.${misNumber}.${misInstance}.${suffix}`;
}

/** HL7 name: ровно один given (имя + отчество через пробел) */
export function buildCdaPersonNameXml(
  family: string,
  given: string,
  middleName?: string
): string {
  const givenFull = middleName?.trim()
    ? `${given.trim()} ${middleName.trim()}`
    : given.trim();
  return `<name>
          <family>${xmlEscape(family)}</family>
          <given>${xmlEscape(givenFull)}</given>
        </name>`;
}

export function mapGenderDisplay(sex: "1" | "2"): string {
  return sex === "2" ? "Женский" : "Мужской";
}
