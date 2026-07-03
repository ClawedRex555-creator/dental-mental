const PLACEHOLDER_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/i;

export function extractDocxPlainText(xml: string): string {
  return xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function collectPlaceholderNamesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{([a-z][a-z0-9_]{0,39})\}/gi)) {
    const name = match[1]?.toLowerCase();
    if (name) found.add(name);
  }
  return [...found];
}

/** Word часто режет {patient_full_name} на несколько <w:r>/<w:t> — собираем имя из XML. */
export function normalizeDocxPlaceholderXml(xml: string): string {
  let result = "";
  let pos = 0;

  while (pos < xml.length) {
    const openIdx = xml.indexOf("{", pos);
    if (openIdx === -1) {
      result += xml.slice(pos);
      break;
    }

    result += xml.slice(pos, openIdx);

    let matched = false;
    const searchEnd = Math.min(xml.length, openIdx + 4000);
    for (let end = openIdx + 2; end < searchEnd; end++) {
      if (xml[end] !== "}") continue;
      const segment = xml.slice(openIdx, end + 1);
      const inner = segment
        .slice(1, -1)
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, "");
      if (PLACEHOLDER_NAME_RE.test(inner)) {
        result += `{${inner.toLowerCase()}}`;
        pos = end + 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result += "{";
      pos = openIdx + 1;
    }
  }

  return result;
}

export function collectPlaceholdersFromDocxXml(xml: string): string[] {
  const plain = extractDocxPlainText(xml);
  const fromPlain = collectPlaceholderNamesFromText(plain);
  if (fromPlain.length > 0) return fromPlain;
  const normalized = normalizeDocxPlaceholderXml(xml);
  return collectPlaceholderNamesFromText(normalized);
}

export const DOCX_TEMPLATE_PARTS_RE =
  /^word\/(document|header\d+|footer\d+)\.xml$/;
