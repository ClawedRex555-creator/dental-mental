"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Copy, Trash2, Wallet, FileText, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, TreatmentPlan, TreatmentPlanItem, TreatmentPlanStatus } from "@/lib/types";
import { TREATMENT_PLAN_STATUS_LABELS, UI } from "@/lib/constants";
import {
  findMatchingPlanItemIndex,
  insertPlanItemAtStageTop,
  normalizePlanItemQuantity,
  planItemLineTotal,
  planItemStageKey,
} from "@/lib/treatment-plan-item-utils";
import {
  calcPlanLinkedPaymentSummary,
  calcPlanRemaining,
  calcPlanTotals,
  groupPlanItemsByStage,
  resolvePlanItemsDoctorId,
} from "@/lib/treatment-plan-utils";
import {
  buildWorkActFromTreatmentPlanItems,
  markPlanItemsCompleted,
} from "@/lib/treatment-plan-finance";
import { printTreatmentPlan } from "@/lib/treatment-plan-print";
import { logAuditClient } from "@/lib/audit-client";
import { canDeleteTreatmentPlans } from "@/lib/rbac";
import {
  getClinicBillableServices,
  normalizeServiceFields,
  SERVICE_CATEGORIES,
} from "@/lib/service-categories";
import { syncTreatmentPlanCommentToPatientNotes } from "@/lib/treatment-plan-patient-note";
import {
  deleteTreatmentPlanViaCommandApi,
  upsertTreatmentPlanViaCommandApi,
} from "@/lib/clinic-entity.client";
import { upsertWorkActViaCommandApi } from "@/lib/clinic-work-act.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
import { AppointmentModal } from "@/components/appointments/appointment-modal";
import { WorkActModal } from "@/components/finance/work-act-modal";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { cn, formatCurrency, generateId } from "@/lib/utils";
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
  "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]";

const compactNumberInputClass =
  "min-w-[3.25rem] px-1.5 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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
    workActs,
    payments,
    addTreatmentPlan,
    updateTreatmentPlan,
    deleteTreatmentPlan,
    addWorkAct,
    addInvoice,
    getNextActNumber,
    patientNotes,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
    currentUser,
    clinicSettings,
  } = useClinicStore();
  const canDeletePlans = canDeleteTreatmentPlans(currentUser.role);
  const isOwner = currentUser.role === "owner";

  const handleToggleDone = (itemId: string, done: boolean) => {
    const item = items.find((i) => i.id === itemId);
    if (
      item?.status === "completed" &&
      item.completedWorkActId &&
      !done &&
      !isOwner
    ) {
      toast.error("Снять отметку «Сделано» может только владелец клиники");
      return;
    }
    updateItem(itemId, {
      status: done ? "completed" : "planned",
      ...(done
        ? {}
        : { completedWorkActId: undefined, completedAt: undefined }),
    });
  };

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [medicalRecordId, setMedicalRecordId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TreatmentPlanStatus>("draft");
  const [items, setItems] = useState<TreatmentPlanItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState("0");
  const [comment, setComment] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewActId, setViewActId] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const initialized = useRef(false);
  const baselineRef = useRef("");
  const scrollToItemIdRef = useRef<string | null>(null);

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
  const { remainingAmount, completedSubtotal } = useMemo(
    () => calcPlanRemaining(items, discountType, Number(discount) || 0),
    [items, discountType, discount]
  );
  const paymentSummary = useMemo(
    () =>
      calcPlanLinkedPaymentSummary(
        items,
        workActs,
        payments,
        discountType,
        Number(discount) || 0
      ),
    [items, workActs, payments, discountType, discount]
  );
  const stageGroups = useMemo(() => groupPlanItemsByStage(items), [items]);

  const capturePlanFormSnapshot = () =>
    JSON.stringify({
      patientId,
      doctorId,
      medicalRecordId,
      title: title.trim(),
      status,
      discountType,
      discount: Number(discount) || 0,
      comment: comment.trim(),
      items: items.map((i) => ({
        id: i.id,
        serviceId: i.serviceId,
        serviceName: i.serviceName.trim(),
        price: i.price,
        quantity: normalizePlanItemQuantity(i.quantity),
        status: i.status,
        stage: i.stage,
        doctorId: i.doctorId,
        toothNumber: i.toothNumber,
        completedWorkActId: i.completedWorkActId,
      })),
    });

  const isFormDirty = () => baselineRef.current !== capturePlanFormSnapshot();

  useEffect(() => {
    const id = scrollToItemIdRef.current;
    if (!id) return;
    scrollToItemIdRef.current = null;
    requestAnimationFrame(() => {
      document
        .getElementById(`plan-item-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [items]);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setSelectedIds(new Set());
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
      baselineRef.current = JSON.stringify({
        patientId: plan.patientId,
        doctorId: plan.doctorId,
        medicalRecordId: plan.medicalRecordId ?? "",
        title: plan.title.trim(),
        status: plan.status,
        discountType: plan.discountType ?? "percent",
        discount: plan.discount ?? 0,
        comment: (plan.comment ?? "").trim(),
        items: plan.items.map((i) => ({
          id: i.id,
          serviceId: i.serviceId,
          serviceName: i.serviceName.trim(),
          price: i.price,
          quantity: normalizePlanItemQuantity(i.quantity),
          status: i.status,
          stage: i.stage,
          doctorId: i.doctorId,
          toothNumber: i.toothNumber,
          completedWorkActId: i.completedWorkActId,
        })),
      });
    } else {
      const emptyPatientId = defaultPatientId ?? "";
      const emptyDoctorId = activeDoctors[0]?.id ?? "";
      const emptyMedicalRecordId = defaultMedicalRecordId ?? "";
      setPatientId(emptyPatientId);
      setDoctorId(emptyDoctorId);
      setMedicalRecordId(emptyMedicalRecordId);
      setTitle("План лечения");
      setStatus("draft");
      setItems([]);
      setDiscountType("percent");
      setDiscount("0");
      setComment("");
      baselineRef.current = JSON.stringify({
        patientId: emptyPatientId,
        doctorId: emptyDoctorId,
        medicalRecordId: emptyMedicalRecordId,
        title: "План лечения",
        status: "draft",
        discountType: "percent",
        discount: 0,
        comment: "",
        items: [],
      });
    }
  }, [open, plan, defaultPatientId, defaultMedicalRecordId, patients, activeDoctors]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addItemFromService = (serviceId: string) => {
    const service = clinicServices.find((s) => s.id === serviceId);
    if (!service) return;
    const normalized = normalizeServiceFields(service);
    const stage = normalized.category;
    const stageKey = planItemStageKey(stage);
    setItems((prev) => {
      const existingIdx = findMatchingPlanItemIndex(prev, service.id);
      if (existingIdx >= 0) {
        const itemId = prev[existingIdx]!.id;
        scrollToItemIdRef.current = itemId;
        return prev.map((it, i) =>
          i === existingIdx
            ? { ...it, quantity: normalizePlanItemQuantity(it.quantity) + 1 }
            : it
        );
      }
      const stageDoctorId = prev.find(
        (it) => planItemStageKey(it.stage) === stageKey && it.doctorId
      )?.doctorId;
      const newItem: TreatmentPlanItem = {
        id: generateId("tpi"),
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        quantity: 1,
        status: "planned" as const,
        stage,
        ...(stageDoctorId ? { doctorId: stageDoctorId } : {}),
      };
      scrollToItemIdRef.current = newItem.id;
      // В начало своей темы: groupPlanItemsByStage склеит все позиции темы в один блок
      return insertPlanItemAtStageTop(prev, newItem);
    });
  };

  const selectServiceForItem = (itemId: string, serviceId: string) => {
    const service = clinicServices.find((s) => s.id === serviceId);
    if (!service) {
      updateItem(itemId, { serviceId: undefined, serviceName: "", price: 0 });
      return;
    }
    const stage = normalizeServiceFields(service).category;
    const stageDoctorId = items.find(
      (it) =>
        it.id !== itemId &&
        ((it.stage ?? "").trim() || "Без категории") ===
          ((stage ?? "").trim() || "Без категории") &&
        it.doctorId
    )?.doctorId;
    updateItem(itemId, {
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      quantity: 1,
      stage,
      ...(stageDoctorId ? { doctorId: stageDoctorId } : {}),
    });
  };

  const setStageDoctor = (stage: string, nextDoctorId: string) => {
    const stageKey = stage.trim() || "Без категории";
    setItems((prev) =>
      prev.map((it) => {
        const itemStage = (it.stage ?? "").trim() || "Без категории";
        if (itemStage !== stageKey) return it;
        return {
          ...it,
          doctorId: nextDoctorId || undefined,
        };
      })
    );
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

  const persistPlanLocally = (payload: TreatmentPlan) => {
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

  const savePlanViaCommand = async (
    payload: TreatmentPlan,
    options?: { thenPrepayment?: boolean }
  ) => {
    beginClinicCommandMutation();
    try {
      const api = await upsertTreatmentPlanViaCommandApi(payload);
      if (!api.ok) {
        toast.error(api.error ?? "Не удалось сохранить план на сервере");
        return false;
      }
      runWithoutClinicFlush(() => persistPlanLocally(payload));
      markClinicSyncedAfterCommand(api.updatedAt, api.revision);
      useClinicStore.getState().pauseClinicAutoSave(15_000);
      notifyClinicDataChanged();
      if (options?.thenPrepayment) {
        toast.success(plan ? "План сохранён" : "План создан");
        onRequestPrepayment?.(payload);
      } else {
        const savedWithComment = Boolean(comment.trim());
        toast.success(
          plan
            ? savedWithComment
              ? "План сохранён, комментарий — в заметках пациента"
              : "План лечения обновлён"
            : savedWithComment
              ? "План создан, комментарий — в заметках пациента"
              : "План лечения создан"
        );
      }
      onOpenChange(false);
      return true;
    } finally {
      endClinicCommandMutation();
    }
  };

  const handleSave = () => {
    const payload = buildPlanPayload();
    if (!payload) return;
    void savePlanViaCommand(payload);
  };

  const handlePrepayment = () => {
    const payload = buildPlanPayload();
    if (!payload) return;
    void savePlanViaCommand(payload, { thenPrepayment: true });
  };

  const handleCreateActFromSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("Выберите услуги для акта");
      return;
    }
    const payload = buildPlanPayload();
    if (!payload) return;

    const { act, invoice } = buildWorkActFromTreatmentPlanItems(
      payload,
      ids,
      getNextActNumber()
    );
    const nextItems = markPlanItemsCompleted(payload.items, ids, act.id);
    const nextPlan: TreatmentPlan = {
      ...payload,
      items: nextItems,
      ...calcPlanTotals(nextItems, payload.discountType, payload.discount),
      status:
        nextItems.every((i) => i.status === "completed")
          ? "completed"
          : payload.status === "draft"
            ? "in_progress"
            : payload.status,
    };

    beginClinicCommandMutation();
    void (async () => {
      try {
        const actApi = await upsertWorkActViaCommandApi({ act });
        if (!actApi.ok) {
          toast.error(actApi.error ?? "Не удалось создать акт");
          return;
        }
        runWithoutClinicFlush(() => {
          addWorkAct(act);
          addInvoice(invoice);
        });
        markClinicSyncedAfterCommand(actApi.updatedAt, actApi.revision);

        const planApi = await upsertTreatmentPlanViaCommandApi(nextPlan);
        if (!planApi.ok) {
          toast.error(planApi.error ?? "Акт создан, но план не обновился");
          return;
        }
        runWithoutClinicFlush(() => persistPlanLocally(nextPlan));
        markClinicSyncedAfterCommand(planApi.updatedAt, planApi.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        setItems(nextItems);
        setSelectedIds(new Set());
        toast.success(`Создан акт № ${act.actNumber}`);
        setViewActId(act.id);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const handleDeletePlan = () => {
    if (!plan) return;
    if (
      !window.confirm(
        `Удалить план «${plan.title}»?\n\nСвязанная заметка будет удалена. Акты и предоплаты в «Финансы» останутся.`
      )
    ) {
      return;
    }
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await deleteTreatmentPlanViaCommandApi(plan.id);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось удалить план");
          return;
        }
        runWithoutClinicFlush(() => {
          deleteTreatmentPlan(plan.id);
        });
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        void logAuditClient({
          action: "delete",
          resourceType: "treatment_plan",
          resourceId: plan.id,
          metadata: { title: plan.title, patientId: plan.patientId },
        });
        toast.success("План лечения удалён");
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const saveDraftAndClose = async () => {
    const payload = buildPlanPayload();
    if (!payload) {
      if (
        window.confirm(
          "Не удалось сохранить черновик — не хватает данных.\n\nЗакрыть без сохранения? Все правки будут потеряны."
        )
      ) {
        onOpenChange(false);
      }
      return;
    }
    await savePlanViaCommand({ ...payload, status: "draft" });
  };

  const attemptClose = () => {
    if (!isFormDirty()) {
      onOpenChange(false);
      return;
    }
    if (
      window.confirm(
        "Есть несохранённые изменения.\n\nСохранить как черновик?"
      )
    ) {
      void saveDraftAndClose();
      return;
    }
    if (
      window.confirm(
        "Закрыть без сохранения? Все правки будут потеряны."
      )
    ) {
      onOpenChange(false);
    }
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    attemptClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onInteractOutside={(e) => {
          e.preventDefault();
          attemptClose();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          attemptClose();
        }}
      >
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
              <Label>Врач плана</Label>
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
              <p className="text-xs text-[var(--muted)]">
                По умолчанию для тем без своего врача
              </p>
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
            <div className="space-y-3">
              {items.length === 0 && (
                <p className="text-sm text-slate-500">
                  {clinicServices.length === 0
                    ? "Сначала добавьте услуги в разделе «Сотрудники»"
                    : "Добавьте услугу из прайса клиники"}
                </p>
              )}
              {stageGroups.map((group) => (
                <div
                  key={group.stage}
                  className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        Тема
                      </p>
                      <h4 className="truncate text-base font-semibold text-[var(--foreground)]">
                        {group.stage}
                      </h4>
                    </div>
                    <div className="flex min-w-[12rem] max-w-sm flex-1 flex-col gap-1">
                      <Label className="text-xs text-[var(--muted)]">
                        Врач по теме
                      </Label>
                      <select
                        className={cn(selectClass, "h-9")}
                        value={group.doctorId ?? ""}
                        onChange={(e) =>
                          setStageDoctor(group.stage, e.target.value)
                        }
                      >
                        <option value="">
                          Как у плана
                          {doctorId
                            ? ` (${activeDoctors.find((d) => d.id === doctorId)?.name ?? ""})`
                            : ""}
                        </option>
                        {activeDoctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="shrink-0 pb-2 text-sm font-medium text-[var(--muted)]">
                      {formatCurrency(group.subtotal)}
                    </span>
                  </div>
                  {group.items.map((item) => {
                    const act = item.completedWorkActId
                      ? workActs.find((a) => a.id === item.completedWorkActId)
                      : undefined;
                    const done = item.status === "completed";
                    return (
                      <div
                        key={item.id}
                        id={`plan-item-${item.id}`}
                        className={cn(
                          "space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5",
                          done && "border-emerald-500/30 bg-emerald-500/5"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                          <label className="inline-flex items-center gap-1.5 text-[var(--foreground)]">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                            />
                            Выбрать
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-[var(--foreground)]">
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={Boolean(
                                done && item.completedWorkActId && !isOwner
                              )}
                              title={
                                done && item.completedWorkActId && !isOwner
                                  ? "Снять отметку может только владелец"
                                  : undefined
                              }
                              onChange={(e) =>
                                handleToggleDone(item.id, e.target.checked)
                              }
                            />
                            Сделано
                          </label>
                          {done && act && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-medium text-teal-600 hover:underline dark:text-teal-400"
                              onClick={() => setViewActId(act.id)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Акт № {act.actNumber}
                            </button>
                          )}
                          {done && !act && item.completedWorkActId && (
                            <span className="text-[var(--muted)]">Акт привязан</span>
                          )}
                          <div className="ml-auto flex min-w-[10rem] max-w-full flex-1 items-center gap-2 sm:max-w-xs">
                            <Label className="shrink-0 text-xs text-[var(--muted)]">
                              Тема
                            </Label>
                            <select
                              className={cn(
                                selectClass,
                                "h-9 min-w-0 flex-1 truncate pr-8"
                              )}
                              value={item.stage ?? ""}
                              title={item.stage || "Без категории"}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  stage: e.target.value || undefined,
                                })
                              }
                            >
                              <option value="">Без категории</option>
                              {SERVICE_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-12 space-y-1 sm:col-span-6">
                            <Label className="text-xs text-[var(--muted)]">Услуга</Label>
                            <ClinicServiceSearch
                              compact
                              services={clinicServices}
                              selectedServiceId={item.serviceId}
                              onSelect={(service) =>
                                selectServiceForItem(item.id, service.id)
                              }
                              placeholder="Поиск услуги..."
                            />
                          </div>
                          <div className="col-span-3 space-y-1 sm:col-span-1">
                            <Label className="text-xs text-[var(--muted)]">Зуб</Label>
                            <Input
                              type="number"
                              placeholder="№"
                              className={compactNumberInputClass}
                              value={item.toothNumber ?? ""}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  toothNumber: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </div>
                          <div className="col-span-3 space-y-1 sm:col-span-1">
                            <Label className="text-xs text-[var(--muted)]">Кол</Label>
                            <Input
                              type="number"
                              min={1}
                              className={compactNumberInputClass}
                              value={normalizePlanItemQuantity(item.quantity)}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  quantity: normalizePlanItemQuantity(
                                    Number(e.target.value) || 1
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="col-span-4 space-y-1 sm:col-span-2">
                            <Label className="text-xs text-[var(--muted)]">
                              Цена · {formatCurrency(planItemLineTotal(item))}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              className={compactNumberInputClass}
                              value={item.price || ""}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  price: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Дублировать"
                              onClick={() => {
                                setItems((prev) => {
                                  const idx = prev.findIndex((it) => it.id === item.id);
                                  if (idx < 0) return prev;
                                  const copy: TreatmentPlanItem = {
                                    ...prev[idx]!,
                                    id: generateId("tpi"),
                                    status: "planned" as const,
                                    completedWorkActId: undefined,
                                    completedAt: undefined,
                                  };
                                  scrollToItemIdRef.current = copy.id;
                                  const next = [...prev];
                                  next.splice(idx + 1, 0, copy);
                                  return next;
                                });
                              }}
                            >
                              <Copy className="h-4 w-4 text-[var(--muted)]" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Удалить"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={handleCreateActFromSelected}
                >
                  <FileText className="h-4 w-4" />
                  Акт из выбранных
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!patientId || !doctorId}
                  onClick={() => setBookOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Записать пациента
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-slate-50 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Сумма услуг</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            {completedSubtotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Сделано</span>
                <span className="font-medium text-emerald-700">
                  −{formatCurrency(completedSubtotal)}
                </span>
              </div>
            )}
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
            <div className="flex justify-between border-t border-[var(--border)] pt-2">
              <span className="font-semibold text-[var(--foreground)]">Итого по плану</span>
              <span className="text-lg font-bold text-[var(--foreground)]">
                {formatCurrency(finalAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-[var(--foreground)]">Остаток по работе</span>
              <span className="text-lg font-bold text-teal-600">
                {formatCurrency(remainingAmount)}
              </span>
            </div>
            {paymentSummary.billedAmount > 0 && (
              <>
                {paymentSummary.paidAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Оплачено по актам</span>
                    <span className="font-medium text-emerald-600">
                      {formatCurrency(paymentSummary.paidAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">Не оплачено по актам</span>
                  <span
                    className={cn(
                      "font-medium",
                      paymentSummary.unpaidAmount > 0
                        ? "text-red-600"
                        : "text-[var(--muted)]"
                    )}
                  >
                    {formatCurrency(paymentSummary.unpaidAmount)}
                  </span>
                </div>
              </>
            )}
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
                onClick={handleDeletePlan}
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={attemptClose}>
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

      <WorkActModal
        open={!!viewActId}
        onOpenChange={(open) => {
          if (!open) setViewActId(null);
        }}
        mode="admin_view"
        existingActId={viewActId ?? undefined}
      />

      <AppointmentModal
        open={bookOpen}
        onOpenChange={setBookOpen}
        defaultPatientId={patientId || undefined}
        defaultDoctorId={
          resolvePlanItemsDoctorId(
            items.filter((it) => selectedIds.has(it.id)),
            doctorId
          ) || undefined
        }
      />
    </>
  );
}
