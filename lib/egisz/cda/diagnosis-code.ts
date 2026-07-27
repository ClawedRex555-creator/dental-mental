/** Извлечение кода МКБ-10 из текста диагноза */

import { resolveMkb10DisplayName } from "@/lib/egisz/cda/nsi-display-names";

const MKB_PREFIX_RE = /^([A-Z]\d{2}(?:\.\d{1,2})?)\b/i;

export interface ParsedDiagnosis {
  code: string;
  displayName: string;
}

export function extractDiagnosisCode(diagnosis: string): ParsedDiagnosis {
  const text = diagnosis.trim();
  const match = text.match(MKB_PREFIX_RE);
  if (match) {
    const code = match[1].toUpperCase();
    return {
      code,
      displayName: resolveMkb10DisplayName(code, text),
    };
  }
  return {
    code: "Z01.2",
    displayName: resolveMkb10DisplayName("Z01.2", text || "Стоматологическое обследование"),
  };
}
