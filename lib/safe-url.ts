/** Разрешены только http(s) и data:image/* для встраивания в HTML */
export function sanitizeHttpImageUrl(url: string | undefined | null): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("javascript:") || lower.startsWith("data:text")) {
    return undefined;
  }

  if (lower.startsWith("data:image/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
