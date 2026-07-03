export const ALLOWED_DATA_URL_PREFIXES = [
  "data:application/pdf;base64,",
  "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,",
  "data:application/msword;base64,",
  "data:image/png;base64,",
  "data:image/jpeg;base64,",
  "data:image/webp;base64,",
] as const;

export type AllowedDataUrlKind = "pdf" | "docx" | "doc" | "png" | "jpeg" | "webp";

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ParsedAllowedDataUrl {
  kind: AllowedDataUrlKind;
  dataUrl: string;
}

function prefixToKind(prefix: string): AllowedDataUrlKind | null {
  switch (prefix) {
    case "data:application/pdf;base64,":
      return "pdf";
    case "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,":
      return "docx";
    case "data:application/msword;base64,":
      return "doc";
    case "data:image/png;base64,":
      return "png";
    case "data:image/jpeg;base64,":
      return "jpeg";
    case "data:image/webp;base64,":
      return "webp";
    default:
      return null;
  }
}

/** ~22 МБ исходного файла в base64 */
const MAX_DATA_URL_LENGTH = 30_000_000;

/** Strict allowlist for embedded file previews (no SVG/HTML/script types). */
export function parseAllowedDataUrl(value: string): ParsedAllowedDataUrl | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > MAX_DATA_URL_LENGTH) return null;

  const prefix = ALLOWED_DATA_URL_PREFIXES.find((p) => trimmed.startsWith(p));
  if (!prefix) return null;

  const kind = prefixToKind(prefix);
  if (!kind) return null;

  const base64 = trimmed.slice(prefix.length);
  if (!base64 || base64.length % 4 === 1) return null;
  if (!BASE64_RE.test(base64)) return null;

  return { kind, dataUrl: `${prefix}${base64}` };
}

export function isAllowedDataUrl(value: string): boolean {
  return parseAllowedDataUrl(value) !== null;
}
