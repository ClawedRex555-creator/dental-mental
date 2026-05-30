export function normalizePhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "+7";
  let rest = digits;
  if (rest.startsWith("8")) rest = "7" + rest.slice(1);
  if (rest.startsWith("7")) rest = rest.slice(1);
  rest = rest.slice(0, 10);
  return `+7${rest}`;
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizePhoneInput(phone);
  const d = n.replace(/\D/g, "").slice(1);
  if (d.length <= 3) return `+7 (${d}`;
  if (d.length <= 6) return `+7 (${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 8) return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}
