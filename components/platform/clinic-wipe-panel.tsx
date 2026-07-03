"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ClinicWipePanelProps {
  clinicId: string;
  clinicSlug: string;
  clinicName: string;
}

export function ClinicWipePanel({ clinicId, clinicSlug, clinicName }: ClinicWipePanelProps) {
  const [open, setOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [wiping, setWiping] = useState(false);

  const slugMatches = confirmSlug.trim().toLowerCase() === clinicSlug.toLowerCase();

  const handleWipe = async () => {
    if (!slugMatches) return;
    setWiping(true);
    try {
      const res = await fetch(`/api/platform/clinics/${clinicId}/wipe`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: confirmSlug.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Не удалось очистить данные клиники");
        return;
      }
      toast.success(
        `Данные «${clinicName}» очищены. Бэкап: ${data.backupFileName ?? "сохранён"}`
      );
      setOpen(false);
      setConfirmSlug("");
    } catch {
      toast.error("Не удалось связаться с сервером");
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-900">Очистить все данные клиники</p>
          <p className="text-xs text-red-800/80">
            Перед удалением создаётся полный JSON-бэкап на сервере. Пациенты, записи, финансы,
            документы и прочие операционные данные будут удалены. Настройки клиники (название,
            ИНН, адрес, расписание) сохранятся.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmSlug("");
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Очистить…
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Очистить данные «{clinicName}»?</DialogTitle>
              <p className="text-sm text-slate-500">
                Будет создан бэкап всей информации клиники, затем операционные данные удалятся.
                Это действие необратимо.
              </p>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`wipe-confirm-${clinicId}`}>
                Введите slug клиники для подтверждения:{" "}
                <span className="font-mono text-teal-700">{clinicSlug}</span>
              </Label>
              <Input
                id={`wipe-confirm-${clinicId}`}
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={clinicSlug}
                autoComplete="off"
                disabled={wiping}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={wiping}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={handleWipe}
                disabled={!slugMatches || wiping}
              >
                {wiping ? "Очистка…" : "Да, очистить и сохранить бэкап"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
