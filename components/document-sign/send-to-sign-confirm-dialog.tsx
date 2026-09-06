"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { maskPhoneForSign } from "@/lib/document-sign/emkaro-sign/document-types";

export function SendToSignConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  patientPhone: string;
  documentNames: string[];
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Создать пакет на подпись</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-[var(--muted)]">Пациент:</span>{" "}
            <strong>{props.patientName}</strong>
          </p>
          <p>
            <span className="text-[var(--muted)]">Телефон:</span>{" "}
            {maskPhoneForSign(props.patientPhone)}
          </p>
          <div>
            <p className="text-[var(--muted)]">Документы:</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {props.documentNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-[var(--muted)]">
            SMS уйдёт с телефона клиники вручную. Emkaro не отправляет SMS автоматически.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button type="button" disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? "Создание…" : "Создать пакет"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
