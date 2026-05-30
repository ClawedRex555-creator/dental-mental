import type { Doctor } from "@/lib/types";

export async function fetchStaffFromServer(): Promise<Doctor[] | null> {
  const res = await fetch("/api/clinic/staff", { credentials: "same-origin" });
  if (res.status === 503) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { staff?: Doctor[] };
  return Array.isArray(data.staff) ? data.staff : [];
}

export async function saveStaffToServer(doctor: Doctor): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/clinic/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ doctor }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? "Не удалось сохранить сотрудника" };
  return { ok: true };
}

export async function deleteStaffOnServer(staffId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/clinic/staff?id=${encodeURIComponent(staffId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? "Не удалось удалить сотрудника" };
  return { ok: true };
}
