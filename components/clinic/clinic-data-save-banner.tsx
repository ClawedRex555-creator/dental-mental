"use client";

import { useState } from "react";
import {
  requestClinicDataFlush,
  requestDiscardLocalEditsAndPull,
  requestForcePullClinicDataFromServer,
  requestSaveThenPullClinicData,
} from "@/lib/clinic-data-sync.client";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";

export function ClinicDataSaveBanner() {
  const phase = useClinicStore((s) => s.clinicSyncPhase);
  const saveStatus = useClinicStore((s) => s.clinicSaveStatus);
  const serverNewer = useClinicStore((s) => s.clinicServerNewerAvailable);
  const saveError = useClinicStore((s) => s.clinicDataSaveError);
  const [syncActionLoading, setSyncActionLoading] = useState(false);

  const runSyncAction = async (action: () => Promise<void>) => {
    if (syncActionLoading) return;
    setSyncActionLoading(true);
    try {
      await action();
    } finally {
      setSyncActionLoading(false);
    }
  };

  const retrySave = () => {
    const store = useClinicStore.getState();
    store.setClinicDataSaveError(null);
    store.setClinicSaveStatus("pending");
    requestClinicDataFlush();
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
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </Button>
        </span>
      </div>
    );
  }

  if (
    serverNewer &&
    (phase === "ready" || phase === "read_only")
  ) {
    const hasLocalQueue = saveStatus === "pending" || saveStatus === "saving";
    return (
      <div
        role="alert"
        className="relative z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <span>
          На сервере более новые данные с другого устройства.
          {hasLocalQueue
            ? " Дождитесь отправки ваших правок или отмените их."
            : " Обновите, чтобы увидеть актуальное расписание."}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-2">
          {hasLocalQueue ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncActionLoading}
                className="h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
                onClick={() => void runSyncAction(requestSaveThenPullClinicData)}
              >
                {syncActionLoading ? "Отправка…" : "Отправить и обновить"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncActionLoading}
                className="h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
                onClick={() =>
                  void runSyncAction(() =>
                    requestDiscardLocalEditsAndPull({ force: true })
                  )
                }
              >
                Отменить мои правки
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={syncActionLoading}
              className="h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
              onClick={() =>
                void runSyncAction(() =>
                  requestForcePullClinicDataFromServer({
                    force: true,
                    allowApplyDespitePending: true,
                    allowDuringSaveCooldown: true,
                  })
                )
              }
            >
              {syncActionLoading ? "Обновление…" : "Обновить с сервера"}
            </Button>
          )}
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

  if (phase === "ready" && saveStatus === "saving") {
    return (
      <div className="border-b border-teal-100 bg-teal-50/80 px-4 py-1.5 text-center text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
        Отправка на сервер… Дождитесь подтверждения.
      </div>
    );
  }

  if (phase === "ready" && saveStatus === "pending") {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        Изменения ждут отправки на сервер…
      </div>
    );
  }

  if (phase === "ready" && saveStatus === "saved") {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-center text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        Сохранено на сервере — другие устройства увидят изменения через несколько секунд.
      </div>
    );
  }

  return null;
}
