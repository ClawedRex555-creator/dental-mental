"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Не удалось открыть раздел</h1>
      <p className="max-w-md text-sm text-slate-600">
        {error.message || "Ошибка интерфейса. Попробуйте обновить страницу."}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Повторить</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/appointments")}>
          На расписание
        </Button>
      </div>
    </div>
  );
}
