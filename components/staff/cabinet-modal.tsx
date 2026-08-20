"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Cabinet } from "@/lib/types";
import { runWithoutClinicFlush, useClinicStore } from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { upsertCabinetViaCommandApi } from "@/lib/clinic-snapshot-command.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";

interface CabinetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CabinetModal({ open, onOpenChange }: CabinetModalProps) {
  const { addCabinet } = useClinicStore();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setNumber("");
  }, [open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Укажите название кабинета");
      return;
    }
    const cabinet: Cabinet = {
      id: generateId("cab"),
      name: name.trim(),
      number: number.trim() || "1",
      equipment: [],
      staffIds: [],
      status: "active",
    };
    const api = await upsertCabinetViaCommandApi(cabinet);
    if (!api.ok) {
      toast.error(api.error ?? "Не удалось сохранить кабинет на сервере");
      return;
    }
    runWithoutClinicFlush(() => {
      addCabinet(cabinet);
    });
    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
    useClinicStore.getState().pauseClinicAutoSave(15_000);
    notifyClinicDataChanged();
    toast.success("Кабинет добавлен");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить кабинет</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Кабинет 1" />
          </div>
          <div className="space-y-2">
            <Label>Номер</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="101" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => void handleSave()}>Сохранить</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
