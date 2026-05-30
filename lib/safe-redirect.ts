/** Безопасный внутренний путь после login (защита от open redirect) */
export function safeRedirectPath(from: string | null | undefined): string {
  if (!from || typeof from !== "string") return "/appointments";
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return "/appointments";
  }
  if (from === "/login" || from.startsWith("/login/")) return "/appointments";
  return from;
}
