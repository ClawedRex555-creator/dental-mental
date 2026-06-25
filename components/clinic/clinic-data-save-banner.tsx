"use client";

import { requestClinicDataPull } from "@/lib/clinic-data-sync.client";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";

export function ClinicDataSaveBanner() {
  const phase = useClinicStore((s) => s.clinicSyncPhase);
  const unsaved = useClinicStore((s) => s.clinicDataUnsaved);
  const serverNewer = useClinicStore((s) => s.clinicServerNewerAvailable);
  const saveError = useClinicStore((s) => s.clinicDataSaveError);

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

  if (saveError) {
    return (
      <div
        role="alert"
        className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
      >
        {saveError} Данные в буфере вкладки — не закрывайте браузер, обновите страницу (F5).
      </div>
    );
  }

  if (
    serverNewer &&
    (phase === "ready" || phase === "read_only")
  ) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <span>
          Информация могла устареть — на сервере более новые данные.
          {unsaved
            ? " Дождитесь сохранения или перезагрузите страницу."
            : " Обновите, чтобы увидеть актуальное расписание и записи."}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-2">
          {!unsaved && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
              onClick={() => requestClinicDataPull({ force: true })}
            >
              Обновить данные
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-8 bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
            onClick={() => window.location.reload()}
          >
            Перезагрузить страницу
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

  if (phase === "ready" && unsaved) {
    return (
      <div className="border-b border-teal-100 bg-teal-50/80 px-4 py-1.5 text-center text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
        Сохранение на сервер…
      </div>
    );
  }

  return null;
}
