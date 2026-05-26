"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, TreatmentPlan, TreatmentPlanItem, TreatmentPlanStatus } from "@/lib/types";
import { TREATMENT_PLAN_STATUS_LABELS, UI } from "@/lib/constants";
import { calcPlanTotals } from "@/lib/treatment-plan-utils";
import { printTreatmentPlan } from "@/lib/treatment-plan-print";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { useClinicStore } from "@/store/useClinicStore";
import { formatCurrency, generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TreatmentPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: TreatmentPlan | null;
  defaultPatientId?: string;
  defaultMedicalRecordId?: string;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";

export function TreatmentPlanModal({
  open,
  onOpenChange,
  plan,
  defaultPatientId,
  defaultMedicalRecordId,
}: TreatmentPlanModalProps) {
  const {
    patients,
    doctors,
    services,
    medicalRecords,
    addTreatmentPlan,
    updateTreatmentPlan,
    clinicSettings,
  } = useClinicStore();

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [medicalRecordId, setMedicalRecordId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TreatmentPlanStatus>("draft");
  const [items, setItems] = useState<TreatmentPlanItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState("0");
  const [comment, setComment] = useState("");
  const initialized = useRef(false);

  const activeDoctors = doctors.filter((d) => d.role === "doctor");

  const patientRecords = useMemo(
    () => medicalRecords.filter((r) => r.patientId === patientId),
    [medicalRecords, patientId]
  );

  const { totalAmount, finalAmount } = useMemo(
    () => calcPlanTotals(items, discountType, Number(discount) || 0),
    [items, discountType, discount]
  );

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (plan) {
      setPatientId(plan.patientId);
      setDoctorId(plan.doctorId);
      setMedicalRecordId(plan.medicalRecordId ?? "");
      setTitle(plan.title);
      setStatus(plan.status);
      setItems(plan.items);
      setDiscountType(plan.discountType ?? "percent");
      setDiscount(String(plan.discount ?? 0));
      setComment(plan.comment ?? "");
    } else {
      setPatientId(defaultPatientId ?? patients[0]?.id ?? "");
      setDoctorId(activeDoctors[0]?.id ?? "");
      setMedicalRecordId(defaultMedicalRecordId ?? "");
      setTitle("План лечения");
      setStatus("draft");
      setItems([]);
      setDiscountType("percent");
      setDiscount("0");
      setComment("");
    }
  }, [open, plan, defaultPatientId, defaultMedicalRecordId, patients, activeDoctors]);

  const addItemFromService = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    setItems((prev) => [
      ...prev,
      {
        id: generateId("tpi"),
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        status: "planned",
        stage: service.category,
      },
    ]);
  };

  const selectServiceForItem = (itemId: string, serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      updateItem(itemId, { serviceId: undefined, serviceName: "", price: 0 });
      return;
    }
    updateItem(itemId, {
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      stage: service.category,
    });
  };

  const updateItem = (id: string, data: Partial<TreatmentPlanItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = () => {
    if (!patientId || !doctorId || !title.trim()) {
      toast.error("Укажите пациента, врача и название плана");
      return;
    }
    if (items.length === 0 || items.some((i) => !i.serviceId || !i.serviceName.trim())) {
      toast.error("Выберите услуги из прайса клиники");
      return;
    }

    const payload: TreatmentPlan = {
      id: plan?.id ?? generateId("tp"),
      patientId,
      doctorId,
      medicalRecordId: medicalRecordId || undefined,
      title: title.trim(),
      items: items.map((i) => ({ ...i, serviceName: i.serviceName.trim() })),
      totalAmount,
      discountType,
      discount: Number(discount) || 0,
      finalAmount,
      status,
      createdAt: plan?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
      comment: comment.trim() || undefined,
    };

    if (plan) {
      updateTreatmentPlan(plan.id, payload);
      toast.success("План лечения обновлён");
    } else {
      addTreatmentPlan(payload);
      toast.success("План лечения создан");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? "Редактировать план лечения" : "Новый план лечения"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{UI.patient}</Label>
              <select
                className={selectClass}
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setMedicalRecordId("");
                }}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName} {p.firstName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{UI.doctor}</Label>
              <select
                className={selectClass}
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Связь с медкартой</Label>
              <select
                className={selectClass}
                value={medicalRecordId}
                onChange={(e) => setMedicalRecordId(e.target.value)}
              >
                <option value="">Без привязки</option>
                {patientRecords.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.createdAt} — {r.diagnosis.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{UI.status}</Label>
              <select
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as TreatmentPlanStatus)}
              >
                {Object.entries(TREATMENT_PLAN_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Название плана</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Label className="pt-2">Услуги в плане</Label>
              {services.length > 0 && (
                <div className="min-w-[240px] flex-1 max-w-md">
                  <ClinicServiceSearch
                    compact
                    services={services}
                    onSelect={(service) => addItemFromService(service.id)}
                    placeholder="+ из прайса — начните вводить..."
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-slate-500">
                  {services.length === 0
                    ? "Сначала добавьте услуги в разделе «Сотрудники»"
                    : "Добавьте услугу из прайса клиники"}
                </p>
              )}
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-xs text-slate-500">Услуга из прайса</Label>
                    <ClinicServiceSearch
                      compact
                      services={services}
                      selectedServiceId={item.serviceId}
                      onSelect={(service) => selectServiceForItem(item.id, service.id)}
                      placeholder="Поиск услуги..."
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-500">Зуб</Label>
                    <Input
                      type="number"
                      placeholder="№"
                      value={item.toothNumber ?? ""}
                      onChange={(e) =>
                        updateItem(item.id, {
                          toothNumber: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs text-slate-500">Цена (можно изменить)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.price || ""}
                      onChange={(e) =>
                        updateItem(item.id, { price: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Сумма услуг</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Скидка</Label>
                <select
                  className={selectClass}
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                >
                  <option value="percent">В процентах</option>
                  <option value="rubles">В рублях</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">
                  {discountType === "percent" ? "Процент" : "Сумма, ₽"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={discountType === "percent" ? 100 : undefined}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <span className="font-semibold text-slate-900">Итого к оплате</span>
              <span className="text-lg font-bold text-teal-700">{formatCurrency(finalAmount)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Комментарий</Label>
            <textarea
              className="min-h-[60px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {UI.cancel}
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                const patient = patients.find((p) => p.id === patientId);
                const doctor = doctors.find((d) => d.id === doctorId);
                if (!patient || items.length === 0) return;
                const draft: TreatmentPlan = {
                  id: plan?.id ?? "draft",
                  patientId,
                  doctorId,
                  medicalRecordId: medicalRecordId || undefined,
                  title: title.trim() || "План лечения",
                  items,
                  totalAmount,
                  discountType,
                  discount: Number(discount) || 0,
                  finalAmount,
                  status,
                  createdAt: plan?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
                  comment: comment.trim() || undefined,
                };
                printTreatmentPlan(draft, patient, doctor, clinicSettings);
              }}
            >
              Распечатать
            </Button>
            <Button onClick={handleSave}>{UI.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
