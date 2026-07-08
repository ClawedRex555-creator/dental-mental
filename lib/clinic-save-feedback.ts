import { FetchTimeoutError } from "@/lib/fetch-with-timeout";

/** Состояние отправки снимка клиники на сервер */
export type ClinicSaveStatus = "idle" | "pending" | "saving" | "saved" | "failed";

export function clinicSaveErrorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "Нет подключения к интернету. Изменения пока только на этом устройстве.";
  }
  if (error instanceof FetchTimeoutError) {
    return `${error.message} Изменения пока только на этом устройстве — нажмите «Повторить отправку».`;
  }
  if (error instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return "Не удалось связаться с сервером. Изменения пока только на этом устройстве.";
    }
    return error.message;
  }
  return "Сервер не подтвердил сохранение. Изменения пока только на этом устройстве.";
}

export interface ClinicSaveServerResponse {
  ok: boolean;
  error?: string;
  updatedAt?: string;
  merged?: boolean;
  forbidden?: boolean;
}

/** Разбор ответа PUT /api/clinic/data — считаем успехом только явное ok + updatedAt */
export function parseClinicSaveServerResponse(
  res: Response,
  json: { ok?: boolean; error?: string; updatedAt?: string; merged?: boolean }
): ClinicSaveServerResponse {
  if (res.status === 403) {
    return {
      ok: false,
      forbidden: true,
      error: json.error ?? "Доступ запрещён",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? "Сервер отклонил сохранение",
    };
  }
  if (json.ok !== true) {
    return {
      ok: false,
      error: json.error ?? "Сервер не подтвердил сохранение (нет ok: true)",
    };
  }
  if (!json.updatedAt?.trim()) {
    return {
      ok: false,
      error: "Сервер не вернул время сохранения — повторите отправку",
    };
  }
  return {
    ok: true,
    updatedAt: json.updatedAt,
    merged: json.merged === true,
  };
}
