"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, TreatmentPlan, TreatmentPlanItem, TreatmentPlanStatus } from "@/lib/types";
import { TREATMENT_PLAN_STATUS_LABELS, UI } from "@/lib/constants";
import {
  findMatchingPlanItemIndex,
  normalizePlanItemQuantity,
  planItemLineTotal,
} from "@/lib/treatment-plan-item-utils";
import { calcPlanTotals } from "@/lib/treatment-plan-utils";
import { printTreatmentPlan } from "@/lib/treatment-plan-print";
import { logAuditClient } from "@/lib/audit-client";
import { canDeleteTreatmentPlans } from "@/lib/rbac";
import { getClinicBillableServices } from "@/lib/service-categories";
import { syncTreatmentPlanCommentToPatientNotes } from "@/lib/treatment-plan-patient-note";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
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
  onRequestPrepayment?: (plan: TreatmentPlan) => void;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";

export function TreatmentPlanModal({
  open,
  onOpenChange,
  plan,
  defaultPatientId,
  defaultMedicalRecordId,
  onRequestPrepayment,
}: TreatmentPlanModalProps) {
  const {
    patients,
    doctors,
    services,
    medicalRecords,
    addTreatmentPlan,
    updateTreatmentPlan,
    deleteTreatmentPlan,
    patientNotes,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
    currentUser,
    clinicSettings,
  } = useClinicStore();
  const canDeletePlans = canDeleteTreatmentPlans(currentUser.role);

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
  const clinicServices = useMemo(
    () => getClinicBillableServices(services),
    [services]
  );

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
      setPatientId(defaultPatientId ?? "");
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
    const service = clinicServices.find((s) => s.id === serviceId);
    if (!service) return;
    setItems((prev) => {
      const existingIdx = findMatchingPlanItemIndex(prev, service.id);
      if (existingIdx >= 0) {
        return prev.map((it, i) =>
          i === existingIdx
            ? { ...it, quantity: normalizePlanItemQuantity(it.quantity) + 1 }
            : it
        );
      }
      return [
        ...prev,
        {
          id: generateId("tpi"),
          serviceId: service.id,
          serviceName: service.name,
          price: service.price,
          quantity: 1,
          status: "planned" as const,
          stage: service.category,
        },
      ];
    });
  };

  const selectServiceForItem = (itemId: string, serviceId: string) => {
    const service = clinicServices.find((s) => s.id === serviceId);
    if (!service) {
      updateItem(itemId, { serviceId: undefined, serviceName: "", price: 0 });
      return;
    }
    updateItem(itemId, {
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      quantity: 1,
      stage: service.category,
    });
  };

  const updateItem = (id: string, data: Partial<TreatmentPlanItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const buildPlanPayload = (): TreatmentPlan | null => {
    if (!patientId || !doctorId || !title.trim()) {
      toast.error("Укажите пациента, врача и название плана");
      return null;
    }
    if (items.length === 0 || items.some((i) => !i.serviceId || !i.serviceName.trim())) {
      toast.error("Выберите услуги из прайса клиники");
      return null;
    }
    return {
      id: plan?.id ?? generateId("tp"),
      patientId,
      doctorId,
      medicalRecordId: medicalRecordId || undefined,
      title: title.trim(),
      items: items.map((i) => ({
        ...i,
        serviceName: i.serviceName.trim(),
        quantity: normalizePlanItemQuantity(i.quantity),
      })),
      totalAmount,
      discountType,
      discount: Number(discount) || 0,
      finalAmount,
      status,
      createdAt: plan?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
      comment: comment.trim() || undefined,
    };
  };

  const persistPlan = (payload: TreatmentPlan) => {
    const doctorName = doctors.find((d) => d.id === doctorId)?.name ?? "";
    syncTreatmentPlanCommentToPatientNotes({
      plan: payload,
      comment,
      doctorName,
      patientNotes,
      currentUser,
      addPatientNote,
      updatePatientNote,
      deletePatientNote,
    });
    if (plan) {
      updateTreatmentPlan(plan.id, payload);
    } else {
      addTreatmentPlan(payload);
    }
  };

  const handleSave = () => {
    const payload = buildPlanPayload();
    if (!payload) return;

    const savedWithComment = Boolean(comment.trim());
    persistPlan(payload);
    toast.success(
      plan
        ? savedWithComment
          ? "План сохранён, комментарий — в заметках пациента"
          : "План лечения обновлён"
        : savedWithComment
          ? "План создан, комментарий — в заметках пациента"
          : "План лечения создан"
    );
    onOpenChange(false);
  };

  const handlePrepayment = () => {
    const payload = buildPlanPayload();
    if (!payload) return;
    persistPlan(payload);
    toast.success(plan ? "План сохранён" : "План создан");
    onRequestPrepayment?.(payload);
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
              <PatientSearchSelect
                patients={patients}
                selectedPatientId={patientId}
                onSelect={(p) => {
                  setPatientId(p.id);
                  setMedicalRecordId("");
                }}
              />
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
              {clinicServices.length > 0 && (
                <div className="min-w-[240px] flex-1 max-w-md">
                  <ClinicServiceSearch
                    compact
                    services={clinicServices}
                    onSelect={(service) => addItemFromService(service.id)}
                    placeholder="+ из прайса — начните вводить..."
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-slate-500">
                  {clinicServices.length === 0
                    ? "Сначала добавьте услуги в разделе «Сотрудники»"
                    : "Добавьте услугу из прайса клиники"}
                </p>
              )}
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs text-slate-500">Услуга из прайса</Label>
                    <ClinicServiceSearch
                      compact
                      services={clinicServices}
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
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-500">Кол-во</Label>
                    <Input
                      type="number"
                      min={1}
                      value={normalizePlanItemQuantity(item.quantity)}
                      onChange={(e) =>
                        updateItem(item.id, {
                          quantity: normalizePlanItemQuantity(Number(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-slate-500">
                      Цена за ед. · {formatCurrency(planItemLineTotal(item))}
                    </Label>
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
            <p className="text-xs text-slate-500">
              Видят только сотрудники клиники (вкладка «Заметки» в карточке пациента). При
              печати плана комментарий попадает на бланк — пациент увидит его на бумаге.
            </p>
            <textarea
              className="min-h-[60px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Сохранится в заметках пациента с кратким описанием плана"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {canDeletePlans && plan ? (
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Удалить план «${plan.title}»?\n\nСвязанная заметка будет удалена. Акты и предоплаты в «Финансы» останутся.`
                    )
                  ) {
                    return;
                  }
                  if (deleteTreatmentPlan(plan.id)) {
                    void logAuditClient({
                      action: "delete",
                      resourceType: "treatment_plan",
                      resourceId: plan.id,
                      metadata: { title: plan.title, patientId: plan.patientId },
                    });
                    toast.success("План лечения удалён");
                    onOpenChange(false);
                  } else {
                    toast.error("Не удалось удалить план");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {UI.cancel}
            </Button>
            {onRequestPrepayment && (
              <Button
                type="button"
                variant="secondary"
                disabled={items.length === 0}
                onClick={handlePrepayment}
              >
                <Wallet className="h-4 w-4" />
                Предоплата
              </Button>
            )}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
