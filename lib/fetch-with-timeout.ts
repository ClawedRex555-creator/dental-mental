const DEFAULT_MS = 45_000;

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Превышено время ожидания ответа сервера (${Math.round(ms / 1000)} с)`);
    this.name = "FetchTimeoutError";
  }
}

/** fetch с таймаутом — иначе синхронизация зависает без ошибки */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new FetchTimeoutError(timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
