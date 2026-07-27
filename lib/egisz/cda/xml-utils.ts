/** Утилиты для сборки CDA XML */

/** Ростовская область / Москва — фиксированный offset для ЕГИСЗ */
export const EGISZ_DEFAULT_TZ_OFFSET = "+0300";

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

function parseTzOffsetMinutes(offset: string): number {
  const m = offset.trim().match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return 180; // +0300
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Стена часов в заданном offset → YYYYMMDDHHmm */
function wallClockStamp(date: Date, offset: string): string {
  const offsetMin = parseTzOffsetMinutes(offset);
  // Сдвигаем UTC-компоненты Date, чтобы getUTC* показали стену часов в offset
  const shifted = new Date(date.getTime() + offsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const mi = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}`;
}

/**
 * HL7 TS: YYYYMMDDHHMM±ZZZZ.
 * По умолчанию +0300 (Ростов / Москва), а не UTC сервера.
 */
export function formatCdaEffectiveTime(
  date: Date = new Date(),
  offset: string = process.env.EGISZ_TZ_OFFSET?.trim() || EGISZ_DEFAULT_TZ_OFFSET
): string {
  return `${wallClockStamp(date, offset)}${offset.replace(":", "")}`;
}

/** HL7 TS date only: YYYYMMDD */
export function formatCdaDate(dateIso: string): string {
  return dateIso.slice(0, 10).replace(/-/g, "");
}

/** ISO-8601 с offset для N3 CreationDate, напр. 2026-07-16T12:00:00+03:00 */
export function formatN3DateTime(
  date: Date = new Date(),
  offset: string = process.env.EGISZ_TZ_OFFSET?.trim() || EGISZ_DEFAULT_TZ_OFFSET
): string {
  const stamp = wallClockStamp(date, offset);
  const y = stamp.slice(0, 4);
  const mo = stamp.slice(4, 6);
  const d = stamp.slice(6, 8);
  const h = stamp.slice(8, 10);
  const mi = stamp.slice(10, 12);
  const off = offset.includes(":")
    ? offset
    : `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return `${y}-${mo}-${d}T${h}:${mi}:00${off}`;
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

/** HL7 name по У1-1: ровно 1 given; отчество — identity:Patronymic. */
export function buildCdaPersonNameXml(
  family: string,
  given: string,
  middleName?: string
): string {
  const givenName = given.trim();
  const middle = middleName?.trim();
  const patronymic = middle
    ? `\n          <identity:Patronymic xsi:type="ST">${xmlEscape(middle)}</identity:Patronymic>`
    : "";
  return `<name>
          <family>${xmlEscape(family)}</family>
          <given>${xmlEscape(givenName)}</given>${patronymic}
        </name>`;
}

export function mapGenderDisplay(sex: "1" | "2"): string {
  return sex === "2" ? "Женский" : "Мужской";
}
