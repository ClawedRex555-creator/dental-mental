/** Извлечение кода МКБ-10 из текста диагноза */

const MKB_PREFIX_RE = /^([A-Z]\d{2}(?:\.\d{1,2})?)\b/i;

export interface ParsedDiagnosis {
  code: string;
  displayName: string;
}

export function extractDiagnosisCode(diagnosis: string): ParsedDiagnosis {
  const text = diagnosis.trim();
  const match = text.match(MKB_PREFIX_RE);
  if (match) {
    return {
      code: match[1].toUpperCase(),
      displayName: text,
    };
  }
  return {
    code: "Z01.2",
    displayName: text || "Стоматологический осмотр",
  };
}
