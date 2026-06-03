"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useClinicStore } from "@/store/useClinicStore";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { printPrepaymentAct } from "@/lib/prepayment-act-print";
import { formatCurrency, generateId } from "@/lib/utils";
import { calcDiscountTotals } from "@/lib/discount-utils";
import type { DiscountType, TreatmentPlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass =
  "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]";

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
  const router = useRouter();
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
  const [items, setItems] = useState<
    { id: string; serviceId?: string; serviceName: string; price: number }[]
  >([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState(0);
  const initialized = useRef(false);

  const subtotalAmount = useMemo(() => items.reduce((s, i) => s + i.price, 0), [items]);
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
      setPatientId(defaultTreatmentPlan.patientId);
      setItems(
        defaultTreatmentPlan.items.map((item) => ({
          id: generateId("prei"),
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          price: item.price,
        }))
      );
      setDiscountType(defaultTreatmentPlan.discountType ?? "percent");
      setDiscount(defaultTreatmentPlan.discount ?? 0);
      setPaidAmount(String(defaultTreatmentPlan.finalAmount));
    } else {
      setPatientId(defaultPatientId ?? patients[0]?.id ?? "");
      setPaidAmount("");
      setItems([]);
      setDiscountType("percent");
      setDiscount(0);
    }
  }, [open, patients, defaultPatientId, defaultTreatmentPlan]);

  const addService = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    setItems((prev) => [
      ...prev,
      {
        id: generateId("prei"),
        serviceId: svc.id,
        serviceName: svc.name,
        price: svc.price,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = () => {
    if (!patientId || items.length === 0) {
      toast.error("Выберите пациента и услуги");
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

    const workItems = items.map((it) => ({
      id: generateId("wai"),
      serviceId: it.serviceId,
      serviceName: it.serviceName,
      quantity: 1,
      price: it.price,
      total: it.price,
    }));

    const prepayment = {
      id: prepId,
      patientId,
      items: items.map(({ serviceId, serviceName, price }) => ({
        serviceId,
        serviceName,
        price,
      })),
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

    addWorkAct({
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
    });

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
    printPrepaymentAct(prepayment, patient, clinicSettings);

    toast.success("Акт предоплаты создан. Перейдите к оплате внесённой суммы.");
    onOpenChange(false);
    router.push(`/finance?tab=acts&payAct=${actId}`);
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
            <select
              className={selectClass}
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName} {p.firstName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Услуги клиники</Label>
            <ClinicServiceSearch services={services} onSelect={(s) => addService(s.id)} />
            {items.length > 0 && (
              <ul className="space-y-1 text-sm">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded bg-[var(--card)] border border-[var(--border)] px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
                      {it.serviceName}
                    </span>
                    <span className="shrink-0 text-[var(--foreground)]">
                      {formatCurrency(it.price)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeItem(it.id)}
                      title="Удалить услугу"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Сумма услуг</p>
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
