"use client";

import { useState } from "react";
import type { PaymentMethod, WorkAct } from "@/lib/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "installment"];

interface PayActDialogProps {
  act: WorkAct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (actId: string, method: PaymentMethod) => void;
}

export function PayActDialog({ act, open, onOpenChange, onConfirm }: PayActDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");

  if (!act) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Оплата акта № {act.actNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Сумма к оплате:{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(act.totalAmount)}
            </span>
          </p>
          <div className="space-y-2">
            <Label>Способ оплаты</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => onConfirm(act.id, method)}>Подтвердить оплату</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
