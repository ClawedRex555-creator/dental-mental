/** Безопасный внутренний путь после login (защита от open redirect) */
export function safeRedirectPath(from: string | null | undefined): string {
  if (!from || typeof from !== "string") return "/appointments";
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return "/appointments";
  }
  const pathOnly = from.split("?")[0]?.split("#")[0] ?? from;
  if (pathOnly === "/login" || pathOnly.startsWith("/login/")) return "/appointments";
  return from;
}
