"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
import { printPrepaymentAct } from "@/lib/prepayment-act-print";
import { createPrepaymentViaCommandApi } from "@/lib/clinic-entity.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import { getClinicBillableServices } from "@/lib/service-categories";
import { formatCurrency, generateId } from "@/lib/utils";
import { calcDiscountTotals } from "@/lib/discount-utils";
import { normalizePlanItemQuantity } from "@/lib/treatment-plan-item-utils";
import type { DiscountType, TreatmentPlan, WorkAct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PrepayMode = "services" | "lump_sum";

type PrepayItem = {
  id: string;
  serviceId?: string;
  serviceName: string;
  quantity: number;
  /** Цена за единицу */
  price: number;
};

const compactNumberInputClass =
  "min-w-[3rem] text-center px-2 text-sm text-[var(--foreground)] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function prepaymentLineTotal(item: { price: number; quantity?: number }): number {
  return item.price * normalizePlanItemQuantity(item.quantity);
}

interface PrepaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPatientId?: string;
  defaultTreatmentPlan?: TreatmentPlan | null;
}

export function PrepaymentModal({
  open,
  onOpenChange,
  defaultPatientId,
  defaultTreatmentPlan,
}: PrepaymentModalProps) {
  const {
    patients,
    services,
    clinicSettings,
    addPrepayment,
    addWorkAct,
    addInvoice,
    getNextActNumber,
  } = useClinicStore();
  const [patientId, setPatientId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [mode, setMode] = useState<PrepayMode>("services");
  const [lumpSumTotal, setLumpSumTotal] = useState("");
  const [items, setItems] = useState<PrepayItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState(0);
  const initialized = useRef(false);
  const clinicServices = useMemo(
    () => getClinicBillableServices(services),
    [services]
  );

  const subtotalAmount = useMemo(() => {
    if (mode === "lump_sum") return Number(lumpSumTotal) || 0;
    return items.reduce((s, i) => s + prepaymentLineTotal(i), 0);
  }, [mode, lumpSumTotal, items]);

  const { totalAmount: finalAmount, discountValue } = useMemo(
    () => calcDiscountTotals(subtotalAmount, discountType, discount),
    [subtotalAmount, discountType, discount]
  );
  const paid = Number(paidAmount) || 0;
  const remainingAmount = Math.max(0, finalAmount - paid);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    if (defaultTreatmentPlan) {
      setMode("services");
      setPatientId(defaultTreatmentPlan.patientId);
      setItems(
        defaultTreatmentPlan.items.map((item) => ({
          id: generateId("prei"),
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          quantity: normalizePlanItemQuantity(item.quantity),
          price: item.price,
        }))
      );
      setLumpSumTotal("");
      setDiscountType(defaultTreatmentPlan.discountType ?? "percent");
      setDiscount(defaultTreatmentPlan.discount ?? 0);
      setPaidAmount(String(defaultTreatmentPlan.finalAmount));
    } else {
      setMode("services");
      setPatientId(defaultPatientId ?? "");
      setPaidAmount("");
      setLumpSumTotal("");
      setItems([]);
      setDiscountType("percent");
      setDiscount(0);
    }
  }, [open, defaultPatientId, defaultTreatmentPlan]);

  const addService = (serviceId: string) => {
    const svc = clinicServices.find((s) => s.id === serviceId);
    if (!svc) return;
    setItems((prev) => [
      ...prev,
      {
        id: generateId("prei"),
        serviceId: svc.id,
        serviceName: svc.name,
        quantity: 1,
        price: svc.price,
      },
    ]);
  };

  const updateItem = (id: string, data: Partial<PrepayItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = () => {
    if (!patientId) {
      toast.error("Выберите пациента");
      return;
    }
    if (mode === "services" && items.length === 0) {
      toast.error("Добавьте услуги или выберите режим «Только сумма»");
      return;
    }
    if (mode === "lump_sum" && finalAmount <= 0) {
      toast.error("Укажите сумму плана");
      return;
    }
    if (paid <= 0) {
      toast.error("Укажите сумму предоплаты");
      return;
    }
    if (paid > finalAmount) {
      toast.error("Предоплата не может превышать сумму с учётом скидки");
      return;
    }

    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const prepId = generateId("pre");
    const actId = generateId("act");
    const actNumber = `ПР-${getNextActNumber()}`;
    const actDate = format(new Date(), "yyyy-MM-dd");
    const invoiceId = generateId("inv");

    const storedItems: {
      serviceId?: string;
      serviceName: string;
      quantity: number;
      price: number;
    }[] =
      mode === "lump_sum"
        ? [
            {
              serviceName: "Предоплата за планируемые услуги",
              price: finalAmount,
              quantity: 1,
            },
          ]
        : items.map(({ serviceId, serviceName, quantity, price }) => ({
            serviceId,
            serviceName,
            quantity: normalizePlanItemQuantity(quantity),
            price,
          }));

    const workItems = storedItems.map((it) => {
      const quantity = normalizePlanItemQuantity(it.quantity);
      const lineTotal = prepaymentLineTotal({ price: it.price, quantity });
      return {
        id: generateId("wai"),
        serviceId: it.serviceId,
        serviceName: it.serviceName,
        quantity,
        price: it.price,
        total: lineTotal,
      };
    });

    const prepayment = {
      id: prepId,
      patientId,
      items: storedItems,
      totalAmount: subtotalAmount,
      discountType,
      discount,
      finalAmount,
      paidAmount: paid,
      remainingAmount,
      date: actDate,
      workActId: actId,
      actNumber,
      notes:
        remainingAmount > 0
          ? `Остаток к оплате: ${formatCurrency(remainingAmount)}`
          : undefined,
    };

    const workAct: WorkAct = {
      id: actId,
      actNumber,
      actDate,
      patientId,
      items: workItems,
      subtotalAmount,
      discountType,
      discount,
      totalAmount: paid,
      plannedTotalAmount: finalAmount,
      paymentStatus: "pending",
      invoiceId,
      createdAt: actDate,
      actType: "prepayment",
      prepaymentId: prepId,
      notes: `Аванс за планируемые услуги. План: ${formatCurrency(finalAmount)}${discountValue > 0 ? ` (скидка ${discountType === "percent" ? `${discount}%` : formatCurrency(discount)})` : ""}, внесено: ${formatCurrency(paid)}${remainingAmount > 0 ? `, остаток: ${formatCurrency(remainingAmount)}` : ""}`,
    };

    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await createPrepaymentViaCommandApi({ prepayment, workAct });
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось создать предоплату на сервере");
          return;
        }
        runWithoutClinicFlush(() => {
          addWorkAct(workAct);
          addInvoice({
            id: invoiceId,
            patientId,
            workActId: actId,
            amount: paid,
            subtotalAmount: finalAmount,
            discountType,
            discount,
            discountValue,
            paid: 0,
            status: "pending",
            date: actDate,
            description:
              discountValue > 0
                ? `Аванс ${actNumber}: план ${formatCurrency(finalAmount)}, скидка ${discountType === "percent" ? `${discount}%` : formatCurrency(discount)}, внесено ${formatCurrency(paid)}`
                : `Аванс (предоплата) по документу ${actNumber}`,
          });
          addPrepayment(prepayment);
        });
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        printPrepaymentAct(prepayment, patient, clinicSettings);
        toast.success("Акт предоплаты создан. Перейдите к оплате внесённой суммы.");
        onOpenChange(false);
        window.setTimeout(() => {
          window.location.assign(`/finance?tab=acts&payAct=${actId}`);
        }, 50);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {defaultTreatmentPlan ? `Предоплата: ${defaultTreatmentPlan.title}` : "Предоплата"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Пациент</Label>
            <PatientSearchSelect
              patients={patients}
              selectedPatientId={patientId}
              disabled={Boolean(defaultTreatmentPlan)}
              onSelect={(p) => setPatientId(p.id)}
            />
          </div>

          {!defaultTreatmentPlan && (
            <div className="flex gap-2 rounded-lg border border-[var(--border)] p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "services" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => setMode("services")}
              >
                По услугам
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "lump_sum" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => {
                  setMode("lump_sum");
                  setItems([]);
                }}
              >
                Только сумма
              </Button>
            </div>
          )}

          {mode === "services" ? (
            <div className="space-y-2">
              <Label>Услуги клиники</Label>
              <ClinicServiceSearch services={clinicServices} onSelect={(s) => addService(s.id)} />
              {items.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-[var(--muted)]">
                    <span className="col-span-5">Услуга</span>
                    <span className="col-span-2 text-center">Кол-во</span>
                    <span className="col-span-2 text-right">Цена</span>
                    <span className="col-span-2 text-right">Сумма</span>
                    <span className="col-span-1" />
                  </div>
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-12 items-center gap-2 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5"
                    >
                      <span className="col-span-5 min-w-0 truncate text-sm text-[var(--foreground)]">
                        {it.serviceName}
                      </span>
                      <div className="col-span-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className={compactNumberInputClass}
                          value={it.quantity > 0 ? String(it.quantity) : ""}
                          placeholder="1"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            updateItem(it.id, {
                              quantity: raw ? Math.max(1, Number(raw)) : 1,
                            });
                          }}
                        />
                      </div>
                      <span className="col-span-2 text-right text-sm text-[var(--foreground)]">
                        {formatCurrency(it.price)}
                      </span>
                      <span className="col-span-2 text-right text-sm font-medium text-[var(--foreground)]">
                        {formatCurrency(prepaymentLineTotal(it))}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="col-span-1 h-8 w-8"
                        onClick={() => removeItem(it.id)}
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Сумма плана, ₽</Label>
              <Input
                type="number"
                min={0}
                value={lumpSumTotal}
                placeholder="Например, 15000"
                onChange={(e) => setLumpSumTotal(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)]">
                Без перечня услуг — в документе будет указана общая сумма аванса.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">
                {mode === "lump_sum" ? "Сумма плана" : "Сумма услуг"}
              </p>
              <p className="font-semibold text-[var(--foreground)]">
                {formatCurrency(subtotalAmount)}
              </p>
            </div>
            {discountValue > 0 && (
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Скидка {discountType === "percent" ? `${discount}%` : formatCurrency(discount)}
                </p>
                <p className="font-semibold text-teal-600">−{formatCurrency(discountValue)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--muted)]">К оплате по плану</p>
              <p className="font-semibold text-[var(--foreground)]">
                {formatCurrency(finalAmount)}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Внесено</Label>
              <Input
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Осталось внести</p>
              <p className="font-semibold text-amber-600">{formatCurrency(remainingAmount)}</p>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Будет сформирован документ о внесении аванса (предоплаты) по законодательству РФ.
            Остаток учитывается как долг пациента.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave}>Внести предоплату</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
