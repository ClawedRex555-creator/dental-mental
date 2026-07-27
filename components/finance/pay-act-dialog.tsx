"use client";

import { useState } from "react";
import type { Payment, PaymentMethod, WorkAct } from "@/lib/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  getWorkActPaidAmount,
  getWorkActRemainingAmount,
  canCloseZeroWorkAct,
} from "@/lib/work-act-payment";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "installment"];

type PayMode = "full" | "partial";

interface PayActDialogProps {
  act: WorkAct | null;
  payments: Payment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (actId: string, method: PaymentMethod, amount: number) => void;
}

function PayActDialogContent({
  act,
  payments,
  onOpenChange,
  onConfirm,
}: Omit<PayActDialogProps, "open" | "act"> & { act: WorkAct }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [mode, setMode] = useState<PayMode>("full");
  const [partialAmount, setPartialAmount] = useState("");

  const isServiceAct = act.actType !== "prepayment";
  const paidSoFar = getWorkActPaidAmount(payments, act.id);
  const remaining = getWorkActRemainingAmount(act, payments);
  const zeroClose = canCloseZeroWorkAct(act, payments);

  const payAmount =
    mode === "partial" && isServiceAct && !zeroClose
      ? Math.min(remaining, Math.max(0, Number(partialAmount) || 0))
      : remaining;

  const canConfirm = zeroClose || payAmount > 0;

  return (
    <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Оплата акта № {act.actNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
            <p className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Сумма акта</span>
              <span className="font-semibold">{formatCurrency(act.totalAmount)}</span>
            </p>
            {paidSoFar > 0 && (
              <p className="mt-1 flex justify-between gap-2">
                <span className="text-[var(--muted)]">Уже внесено</span>
                <span className="text-teal-700">{formatCurrency(paidSoFar)}</span>
              </p>
            )}
            <p className="mt-1 flex justify-between gap-2 border-t border-[var(--border)] pt-2">
              <span className="text-[var(--muted)]">К оплате</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCurrency(remaining)}
              </span>
            </p>
          </div>

          {zeroClose && (
            <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
              Сумма акта 0 ₽ (например, скидка клиники 100%). Можно закрыть акт — ЗП врача
              начислится после закрытия.
            </p>
          )}

          {act.notes?.trim() && (
            <p className="text-sm text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">Примечание:</span>{" "}
              {act.notes}
            </p>
          )}

          {isServiceAct && remaining > 0 && (
            <div className="flex gap-2 rounded-lg border border-[var(--border)] p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "full" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => setMode("full")}
              >
                Полностью
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "partial" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => setMode("partial")}
              >
                Предоплата
              </Button>
            </div>
          )}

          {mode === "partial" && isServiceAct && remaining > 0 && (
            <div className="space-y-2">
              <Label>Сумма предоплаты, ₽</Label>
              <Input
                type="number"
                min={0}
                max={remaining}
                value={partialAmount}
                placeholder={String(remaining)}
                onChange={(e) => setPartialAmount(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)]">
                Остаток {formatCurrency(Math.max(0, remaining - payAmount))} будет учтён как долг
                пациента. ЗП врача начислится только после полной оплаты акта.
              </p>
            </div>
          )}

          {!zeroClose && (
            <div className="space-y-2">
              <Label>Способ оплаты</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
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
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              disabled={!canConfirm}
              onClick={() => onConfirm(act.id, method, payAmount)}
            >
              {zeroClose
                ? "Закрыть акт (0 ₽)"
                : mode === "partial" && isServiceAct
                  ? `Внести ${formatCurrency(payAmount)}`
                  : "Оплатить полностью"}
            </Button>
          </div>
        </div>
      </DialogContent>
  );
}

export function PayActDialog({
  act,
  payments,
  open,
  onOpenChange,
  onConfirm,
}: PayActDialogProps) {
  if (!act) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PayActDialogContent
        key={`${act.id}-${open}`}
        act={act}
        payments={payments}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}
