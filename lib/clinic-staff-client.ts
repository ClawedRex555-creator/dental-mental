import type { Doctor } from "@/lib/types";

export async function fetchStaffFromServer(): Promise<Doctor[] | null> {
  const res = await fetch("/api/clinic/staff", { credentials: "same-origin" });
  if (res.status === 503) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { staff?: Doctor[] };
  return Array.isArray(data.staff) ? data.staff : [];
}

export type StaffCommandResult = {
  ok: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
  alreadyApplied?: boolean;
};

export async function saveStaffToServer(doctor: Doctor): Promise<StaffCommandResult> {
  const res = await fetch("/api/clinic/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ doctor }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    updatedAt?: string | null;
    revision?: number | null;
    alreadyApplied?: boolean;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? "Не удалось сохранить сотрудника" };
  }
  return {
    ok: true,
    alreadyApplied: Boolean(data.alreadyApplied),
    updatedAt: data.updatedAt ?? null,
    revision:
      typeof data.revision === "number" && Number.isFinite(data.revision)
        ? data.revision
        : null,
  };
}

export async function deleteStaffOnServer(staffId: string): Promise<StaffCommandResult> {
  const res = await fetch(`/api/clinic/staff?id=${encodeURIComponent(staffId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    updatedAt?: string | null;
    revision?: number | null;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? "Не удалось удалить сотрудника" };
  }
  return {
    ok: true,
    updatedAt: data.updatedAt ?? null,
    revision:
      typeof data.revision === "number" && Number.isFinite(data.revision)
        ? data.revision
        : null,
  };
}
