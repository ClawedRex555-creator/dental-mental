"use client";

import { useState } from "react";
import { requestClinicDataFlush } from "@/lib/clinic-data-sync.client";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";

/** Только критичные состояния: загрузка, нет доступа, offline, ошибка сохранения, read-only. */
export function ClinicDataSaveBanner() {
  const phase = useClinicStore((s) => s.clinicSyncPhase);
  const saveStatus = useClinicStore((s) => s.clinicSaveStatus);
  const saveError = useClinicStore((s) => s.clinicDataSaveError);
  const [syncActionLoading, setSyncActionLoading] = useState(false);

  const retrySave = () => {
    if (syncActionLoading) return;
    setSyncActionLoading(true);
    try {
      const store = useClinicStore.getState();
      store.setClinicDataSaveError(null);
      store.setClinicSaveStatus("pending");
      requestClinicDataFlush();
    } finally {
      setSyncActionLoading(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        Загрузка данных с сервера…
      </div>
    );
  }

  if (phase === "forbidden") {
    return (
      <div
        role="alert"
        className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
      >
        Нет доступа к данным клиники на сервере. Обратитесь к администратору.
      </div>
    );
  }

  if (phase === "local_only") {
    return (
      <div
        role="alert"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Сервер базы данных недоступен — изменения сохраняются только в этом браузере.
      </div>
    );
  }

  if (saveStatus === "failed" || saveError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
      >
        <span>
          {saveError ??
            "Не удалось отправить изменения на сервер. Данные сохранены в буфере браузера — нажмите «Повторить отправку»."}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={syncActionLoading}
            className="h-8 border-red-300 bg-white text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            onClick={retrySave}
          >
            Повторить отправку
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={syncActionLoading}
            className="h-8 bg-red-700 text-white hover:bg-red-800"
            onClick={() => {
              try {
                const keys: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith("dc-clinic-pending")) keys.push(k);
                }
                for (const k of keys) localStorage.removeItem(k);
              } catch {
                /* ignore */
              }
              window.location.reload();
            }}
          >
            Обновить страницу
          </Button>
        </span>
      </div>
    );
  }

  if (phase === "read_only") {
    return (
      <div
        role="alert"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Роль «бухгалтер»: просмотр финансовых данных. Пациентов и приёмы вносите под владельцем,
        администратором, врачом или ассистентом — иначе изменения не попадут на сервер.
      </div>
    );
  }

  return null;
}
