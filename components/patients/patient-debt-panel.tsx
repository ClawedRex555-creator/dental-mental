"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Patient } from "@/lib/types";
import {
  getPatientDebtAmount,
  parseDebtInput,
  resolveBalanceFromDebt,
} from "@/lib/patient-balance";
import { upsertPatientViaCommandApi } from "@/lib/clinic-patient.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PatientDebtPanel({ patient }: { patient: Patient }) {
  const updatePatient = useClinicStore((s) => s.updatePatient);
  const debtNow = getPatientDebtAmount(patient.balance);
  const [debtInput, setDebtInput] = useState(debtNow > 0 ? String(debtNow) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDebtInput(debtNow > 0 ? String(debtNow) : "");
  }, [patient.id, patient.balance, debtNow]);

  const saveDebt = (debtAmount: number) => {
    if (saving) return;
    const resolved = resolveBalanceFromDebt("debtor", debtAmount, patient.balance);
    const next: Patient = {
      ...patient,
      balance: resolved.balance,
      status: resolved.status,
    };
    setSaving(true);
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await upsertPatientViaCommandApi(next);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось сохранить долг на сервере");
          return;
        }
        runWithoutClinicFlush(() => {
          updatePatient(patient.id, {
            balance: resolved.balance,
            status: resolved.status,
          });
        });
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        if (debtAmount <= 0) {
          toast.success("Долг погашен");
        } else {
          toast.success("Сумма долга обновлена");
        }
      } finally {
        endClinicCommandMutation();
        setSaving(false);
      }
    })();
  };

  const handleSave = () => {
    const amount = parseDebtInput(debtInput);
    if (amount <= 0 && debtNow <= 0) {
      toast.error("Укажите сумму долга");
      return;
    }
    saveDebt(amount);
  };

  const handlePayOff = () => {
    setDebtInput("");
    saveDebt(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Долг пациента</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Баланс:{" "}
          <strong className={patient.balance < 0 ? "text-red-600" : "text-slate-900"}>
            {formatCurrency(patient.balance)}
          </strong>
          {debtNow > 0 && (
            <span className="ml-2 text-red-600">(долг {formatCurrency(debtNow)})</span>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1 space-y-2">
            <Label htmlFor="patient-debt-amount">Сумма долга, ₽</Label>
            <Input
              id="patient-debt-amount"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder="0"
              value={debtInput}
              onChange={(e) => setDebtInput(e.target.value)}
              disabled={saving}
            />
          </div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            Сохранить
          </Button>
          {debtNow > 0 && (
            <Button type="button" variant="outline" onClick={handlePayOff} disabled={saving}>
              Погасить
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
