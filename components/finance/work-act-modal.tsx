"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { closeDialogThenNavigate } from "@/lib/dialog-navigation";
import type {
  DiscountBearer,
  DiscountType,
  PatientPrepayment,
  WorkAct,
  WorkActItem,
} from "@/lib/types";
import { DISCOUNT_BEARER_LABELS } from "@/lib/constants";
import { calcDoctorPaymentForAct } from "@/lib/finance-utils";
import { createInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import { updateAppointmentViaCommandApi } from "@/lib/clinic-appointment.client";
import type { AppointmentCommandPatch } from "@/lib/apply-appointment-commands";
import {
  deleteWorkActViaCommandApi,
  upsertWorkActViaCommandApi,
} from "@/lib/clinic-work-act.client";
import { submitWorkActViaCommandApi } from "@/lib/clinic-work-act-submit.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  getClinicBillableServices,
  getTechnicalServices,
  normalizeServiceFields,
} from "@/lib/service-categories";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import {
  buildWorkActMedicalRecommendations,
  calcWorkActAmounts,
  calcWorkActItemTechnicalAmount,
  calcWorkActTechnicalAmount,
  getWorkActCustomerName,
  isWorkActLineFilled,
  workActHasFilledItems,
} from "@/lib/work-act-utils";
import { buildMedicalRecordFromWorkAct } from "@/lib/work-act-medical-record";
import { printWorkAct } from "@/lib/work-act-print";
import {
  getWorkActPaidAmount,
  isWorkActFullyPaid,
} from "@/lib/work-act-payment";
import { detachAppointmentFromWorkAct } from "@/lib/work-act-visit";
import {
  getOpenPrepaidSources,
  getPrepaymentAvailableCredit,
  getUnsettledPrepaymentItems,
  prepaymentItemLineTotal,
  settlePrepaymentItems,
  withPrepaymentItemIds,
  type OpenPrepaidSource,
} from "@/lib/prepayment-utils";
import { settlePrepaymentViaCommandApi } from "@/lib/clinic-entity.client";
import { normalizePlanItemQuantity } from "@/lib/treatment-plan-item-utils";
import { canDeleteWorkActs } from "@/lib/rbac";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
import { formatCurrency, generateId, getFullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WorkActModalMode = "standard" | "doctor" | "admin_view";

interface WorkActModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPatientId?: string;
  defaultAppointmentId?: string;
  defaultDoctorId?: string;
  defaultItems?: { serviceName: string; price: number; serviceId?: string }[];
  mode?: WorkActModalMode;
  existingActId?: string;
  onSubmitted?: () => void;
  /** Закрыть родительские модалки и перейти в финансы (из расписания) */
  onGoToPayment?: (actId: string) => void;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]";

const compactNumberInputClass =
  "min-w-[4rem] text-center px-2 text-sm text-[var(--foreground)] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function buildWorkActFormSnapshot(input: {
  patientId: string;
  doctorId: string;
  actDate: string;
  items: WorkActItem[];
  discountType: DiscountType;
  discount: string;
  discountBearer: DiscountBearer;
  notes: string;
  linkedPrepaymentId: string | null;
  prepayPath: "pending" | "select" | "new" | "settle";
}): string {
  return JSON.stringify({
    patientId: input.patientId,
    doctorId: input.doctorId,
    actDate: input.actDate,
    discountType: input.discountType,
    discount: Number(input.discount) || 0,
    discountBearer: input.discountBearer,
    notes: input.notes.trim(),
    linkedPrepaymentId: input.linkedPrepaymentId,
    prepayPath: input.prepayPath,
    items: input.items.filter(isWorkActLineFilled).map((i) => ({
      id: i.id,
      serviceId: i.serviceId,
      serviceName: i.serviceName.trim(),
      toothNumber: i.toothNumber,
      quantity: Math.max(1, i.quantity || 1),
      price: i.price || 0,
      discountPercent: i.discountPercent,
      serviceCategory: i.serviceCategory,
      technicalUnitPrice: i.technicalUnitPrice,
    })),
  });
}

export function WorkActModal({
  open,
  onOpenChange,
  defaultPatientId,
  defaultAppointmentId,
  defaultDoctorId,
  defaultItems,
  mode = "standard",
  existingActId,
  onSubmitted,
  onGoToPayment,
}: WorkActModalProps) {
  const {
    patients,
    doctors,
    appointments,
    services,
    clinicSettings,
    workActs,
    payments,
    prepayments,
    addWorkAct,
    updateWorkAct,
    addInvoice,
    addMedicalRecord,
    syncMedicalRecordForWorkAct,
    updateAppointment,
    getNextActNumber,
    deleteWorkAct,
    payWorkAct,
    updatePrepayment,
    currentUser,
  } = useClinicStore();
  const activeDoctors = useMemo(
    () => doctors.filter((d) => d.role === "doctor"),
    [doctors]
  );
  const clinicServices = useMemo(
    () => getClinicBillableServices(services),
    [services]
  );
  const technicalServices = useMemo(
    () => getTechnicalServices(services),
    [services]
  );
  const technicalByClinicServiceId = useMemo(() => {
    const map = new Map<string, typeof technicalServices>();
    for (const tech of technicalServices) {
      const linkedServiceId = tech.linkedClinicServiceId?.trim();
      if (!linkedServiceId) continue;
      const list = map.get(linkedServiceId) ?? [];
      list.push(tech);
      map.set(linkedServiceId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const byTech = (a.technicianName ?? "").localeCompare(b.technicianName ?? "", "ru");
        if (byTech !== 0) return byTech;
        const byService = a.name.localeCompare(b.name, "ru");
        if (byService !== 0) return byService;
        return a.price - b.price;
      });
    }
    return map;
  }, [technicalServices]);
  const isAdminOrOwner = currentUser.role === "admin" || currentUser.role === "owner";

  const existingAct = existingActId
    ? workActs.find((a) => a.id === existingActId)
    : undefined;

  const actMissing = Boolean(existingActId && !existingAct);
  const actNeedsFix = actMissing || (existingAct ? !workActHasFilledItems(existingAct) : false);

  /** pending = выбор источника; select = выбор услуг аванса; settle = зачёт; new = обычный акт */
  const [prepayPath, setPrepayPath] = useState<
    "pending" | "select" | "settle" | "new"
  >("pending");
  const [linkedPrepaymentId, setLinkedPrepaymentId] = useState<string | null>(null);
  const [settleItemIds, setSettleItemIds] = useState<Set<string>>(new Set());
  const [confirmedSettleItemIds, setConfirmedSettleItemIds] = useState<string[]>(
    []
  );

  const linkedAppointmentId =
    defaultAppointmentId ??
    existingAct?.appointmentId ??
    (existingActId
      ? appointments.find((a) => a.workActId === existingActId)?.id
      : undefined);

  const existingActFullyPaid = useMemo(
    () => (existingAct ? isWorkActFullyPaid(existingAct, payments) : false),
    [existingAct, payments]
  );
  const existingActPaidAmount = existingAct
    ? getWorkActPaidAmount(payments, existingAct.id)
    : 0;
  const existingActPartiallyPaid =
    Boolean(existingAct) && !existingActFullyPaid && existingActPaidAmount > 0;

  const canDeleteAct = canDeleteWorkActs(currentUser.role) && Boolean(existingAct);

  const effectiveReadOnly =
    mode === "admin_view" &&
    !(isAdminOrOwner && !existingActFullyPaid);

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [actDate, setActDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<WorkActItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState("0");
  const [discountBearer, setDiscountBearer] = useState<DiscountBearer>("shared");
  const [notes, setNotes] = useState("");
  const [savedActId, setSavedActId] = useState<string | null>(null);
  const [technicalSelectionByItemId, setTechnicalSelectionByItemId] = useState<
    Record<string, string>
  >({});
  const savedActIdRef = useRef<string | null>(null);
  const initialized = useRef(false);
  const baselineRef = useRef("");

  const rememberSavedActId = (actId: string) => {
    savedActIdRef.current = actId;
    setSavedActId(actId);
  };

  const visibleItems = useMemo(() => items.filter(isWorkActLineFilled), [items]);

  const captureWorkActFormSnapshot = () =>
    buildWorkActFormSnapshot({
      patientId,
      doctorId,
      actDate,
      items,
      discountType,
      discount,
      discountBearer,
      notes,
      linkedPrepaymentId,
      prepayPath,
    });

  const isFormDirty = () => baselineRef.current !== captureWorkActFormSnapshot();

  const refreshBaseline = () => {
    baselineRef.current = captureWorkActFormSnapshot();
  };

  const { subtotalAmount, afterRowDiscounts, totalAmount, discountValue } = useMemo(
    () => calcWorkActAmounts(items, discountType, Number(discount) || 0),
    [items, discountType, discount]
  );
  const technicalTotal = useMemo(() => calcWorkActTechnicalAmount(items), [items]);
  const technicalTotalCapped = Math.min(Math.max(0, totalAmount), technicalTotal);

  const paymentPreview = useMemo(() => {
    if (!doctorId) return null;
    const doctor = doctors.find((d) => d.id === doctorId);
    if (!doctor) return null;
    const draftAct: WorkAct = {
      id: "preview",
      actNumber: "0",
      actDate,
      patientId: patientId || "p",
      doctorId,
      items,
      subtotalAmount,
      discountType,
      discount: Number(discount) || 0,
      discountBearer,
      totalAmount,
      paymentStatus: "pending",
      createdAt: actDate,
    };
    return calcDoctorPaymentForAct(draftAct, doctor, services);
  }, [
    doctorId,
    doctors,
    services,
    actDate,
    patientId,
    items,
    subtotalAmount,
    discountType,
    discount,
    discountBearer,
    totalAmount,
  ]);

  const loadFromAct = (act: WorkAct) => {
    setPatientId(act.patientId);
    setDoctorId(act.doctorId ?? "");
    setActDate(act.actDate);
    setItems(act.items);
    setTechnicalSelectionByItemId({});
    setDiscountType(act.discountType ?? "percent");
    setDiscount(String(act.discount ?? 0));
    setDiscountBearer(act.discountBearer ?? "shared");
    setNotes(act.notes ?? "");
    rememberSavedActId(act.id);
  };

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      savedActIdRef.current = null;
      setSavedActId(null);
      setTechnicalSelectionByItemId({});
      setPrepayPath("pending");
      setLinkedPrepaymentId(null);
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (existingAct) {
      loadFromAct(existingAct);
      setPrepayPath("new");
      setLinkedPrepaymentId(existingAct.prepaymentId ?? null);
      baselineRef.current = buildWorkActFormSnapshot({
        patientId: existingAct.patientId,
        doctorId: existingAct.doctorId ?? "",
        actDate: existingAct.actDate,
        items: existingAct.items,
        discountType: existingAct.discountType ?? "percent",
        discount: String(existingAct.discount ?? 0),
        discountBearer: existingAct.discountBearer ?? "shared",
        notes: existingAct.notes ?? "",
        linkedPrepaymentId: existingAct.prepaymentId ?? null,
        prepayPath: "new",
      });
      return;
    }

    const nextPatientId = defaultPatientId ?? "";
    const aptForDefaults =
      appointments.find((a) => a.id === defaultAppointmentId) ??
      (existingActId
        ? appointments.find((a) => a.workActId === existingActId)
        : undefined);
    const nextDoctorId =
      defaultDoctorId ??
      aptForDefaults?.doctorId ??
      activeDoctors[0]?.id ??
      "";
    const nextActDate = aptForDefaults?.date ?? format(new Date(), "yyyy-MM-dd");

    setPatientId(nextPatientId);
    setDoctorId(nextDoctorId);
    setActDate(nextActDate);
    setNotes("");
    setDiscountType("percent");
    setDiscount("0");
    setDiscountBearer("shared");
    savedActIdRef.current = null;
    setSavedActId(null);
    setTechnicalSelectionByItemId({});
    setLinkedPrepaymentId(null);

    const openPrepays = getOpenPrepaidSources(
      prepayments,
      workActs,
      payments,
      nextPatientId
    );
    const nextPrepayPath =
      mode === "doctor" ? "new" : openPrepays.length > 0 ? "pending" : "new";
    setPrepayPath(nextPrepayPath);

    const mapDefault = (it: {
      serviceName: string;
      price: number;
      serviceId?: string;
      serviceCategory?: string;
    }) => ({
      id: generateId("wai"),
      serviceId: it.serviceId,
      serviceName: it.serviceName,
      serviceCategory: it.serviceCategory,
      quantity: 1,
      price: it.price,
      total: it.price,
    });

    let nextItems: WorkActItem[] = [];
    if (defaultItems?.length) {
      nextItems = defaultItems.map(mapDefault);
    } else if (aptForDefaults) {
      const svc = aptForDefaults.serviceId
        ? clinicServices.find((s) => s.id === aptForDefaults.serviceId)
        : undefined;
      if (svc) {
        const normalized = normalizeServiceFields(svc);
        nextItems = [
          {
            id: generateId("wai"),
            serviceId: svc.id,
            serviceName: svc.name,
            serviceCategory: normalized.category,
            quantity: 1,
            price: aptForDefaults.price > 0 ? aptForDefaults.price : svc.price,
            total: aptForDefaults.price > 0 ? aptForDefaults.price : svc.price,
          },
        ];
      }
    }
    setItems(nextItems);
    baselineRef.current = buildWorkActFormSnapshot({
      patientId: nextPatientId,
      doctorId: nextDoctorId,
      actDate: nextActDate,
      items: nextItems,
      discountType: "percent",
      discount: "0",
      discountBearer: "shared",
      notes: "",
      linkedPrepaymentId: null,
      prepayPath: nextPrepayPath,
    });
  }, [
    open,
    defaultPatientId,
    defaultAppointmentId,
    defaultItems,
    existingAct,
    existingActId,
    patients,
    appointments,
    clinicServices,
    prepayments,
    workActs,
    payments,
    defaultDoctorId,
    activeDoctors,
    mode,
  ]);

  useEffect(() => {
    if (!open || !existingAct) return;
    loadFromAct(existingAct);
    baselineRef.current = buildWorkActFormSnapshot({
      patientId: existingAct.patientId,
      doctorId: existingAct.doctorId ?? "",
      actDate: existingAct.actDate,
      items: existingAct.items,
      discountType: existingAct.discountType ?? "percent",
      discount: String(existingAct.discount ?? 0),
      discountBearer: existingAct.discountBearer ?? "shared",
      notes: existingAct.notes ?? "",
      linkedPrepaymentId: existingAct.prepaymentId ?? null,
      prepayPath: "new",
    });
  }, [open, existingAct]);

  const openPrepaysForPatient = useMemo(
    () => getOpenPrepaidSources(prepayments, workActs, payments, patientId),
    [prepayments, workActs, payments, patientId]
  );

  const applyPrepaymentCreditLocal = (
    act: WorkAct,
    prep: PatientPrepayment,
    itemIds: string[]
  ) => {
    const credit = getPrepaymentAvailableCredit(prep);
    if (credit <= 0) return;
    const applied = Math.min(credit, act.totalAmount);
    if (applied > 0) {
      payWorkAct(act.id, "transfer", applied);
    }
    const settledAt = format(new Date(), "yyyy-MM-dd");
    const next = settlePrepaymentItems(prep, itemIds, act.id, applied, settledAt);
    updatePrepayment(prep.id, next);
    updateWorkAct(act.id, { prepaymentId: prep.id });
  };

  const chooseNewAct = () => {
    setPrepayPath("new");
    setLinkedPrepaymentId(null);
    setSettleItemIds(new Set());
    setConfirmedSettleItemIds([]);
  };

  const chooseSettlePrepayment = (prep: PatientPrepayment) => {
    const normalized = withPrepaymentItemIds(prep);
    const openItems = getUnsettledPrepaymentItems(normalized);
    if (openItems.length === 0) {
      toast.error("Все услуги по этой предоплате уже зачтены");
      return;
    }
    setLinkedPrepaymentId(prep.id);
    setPrepayPath("select");
    setSettleItemIds(new Set());
    setConfirmedSettleItemIds([]);
    setPatientId(prep.patientId);
    setTechnicalSelectionByItemId({});
    setItems([]);
    setNotes("");
    if (prep.discountType) setDiscountType(prep.discountType);
    if (prep.discount != null) setDiscount(String(prep.discount));
  };

  const confirmSettleItemSelection = () => {
    if (!linkedPrepaymentId) return;
    const prep = (prepayments ?? []).find((p) => p.id === linkedPrepaymentId);
    if (!prep) {
      toast.error("Предоплата не найдена");
      return;
    }
    const normalized = withPrepaymentItemIds(prep);
    const selected = normalized.items.filter(
      (it) => it.id && settleItemIds.has(it.id)
    );
    if (selected.length === 0) {
      toast.error("Выберите хотя бы одну услугу");
      return;
    }
    const nextItems = selected.map((it) => {
      const quantity = normalizePlanItemQuantity(it.quantity);
      const price = it.price;
      return {
        id: generateId("wai"),
        serviceId: it.serviceId,
        serviceName: it.serviceName,
        quantity,
        price,
        total: quantity * price,
      };
    });
    setItems(nextItems);
    setConfirmedSettleItemIds(selected.map((it) => it.id!).filter(Boolean));
    setPrepayPath("settle");
    const openAll = getUnsettledPrepaymentItems(normalized);
    const selectedAllOpen = selected.length === openAll.length;
    if (!selectedAllOpen) {
      setDiscount("0");
    } else if (prep.discount != null) {
      setDiscount(String(prep.discount));
    }
    const credit = getPrepaymentAvailableCredit(normalized);
    const selectedTotal = selected.reduce(
      (sum, it) => sum + prepaymentItemLineTotal(it),
      0
    );
    setNotes(
      `Оказание по предоплате ${prep.actNumber ?? ""}`.trim() +
        `. Услуг: ${selected.length}. Аванс доступно: ${credit.toLocaleString("ru-RU")} ₽` +
        (selectedTotal > credit
          ? `. К доплате после зачёта: ${Math.max(0, selectedTotal - credit).toLocaleString("ru-RU")} ₽`
          : "")
    );
    refreshBaseline();
  };

  const chooseOpenPrepaidSource = (source: OpenPrepaidSource) => {
    if (source.kind === "partial_act" && source.act) {
      loadFromAct(source.act);
      setLinkedPrepaymentId(null);
      setPrepayPath("new");
      toast.info(
        `Открыт частично оплаченный акт № ${source.act.actNumber}: внесено ${source.credit.toLocaleString("ru-RU")} ₽, остаток ${source.remaining.toLocaleString("ru-RU")} ₽`
      );
      return;
    }
    if (source.kind === "document" && source.prepayment) {
      chooseSettlePrepayment(source.prepayment);
    }
  };

  const persistAct = (submittedToAdmin?: boolean): WorkAct | null => {

    const filledItems = items
      .filter(isWorkActLineFilled)
      .map((i) => {
        const quantity = Math.max(1, i.quantity || 1);
        const technicalUnitPrice =
          i.technicalUnitPrice != null && i.technicalUnitPrice > 0
            ? i.technicalUnitPrice
            : undefined;
        return {
          id: i.id,
          serviceId: i.serviceId,
          serviceName: i.serviceName,
          toothNumber: i.toothNumber,
          quantity,
          price: i.price || 0,
          total: quantity * (i.price || 0),
          discountPercent: i.discountPercent,
          serviceCategory: i.serviceCategory,
          technicalUnitPrice,
        };
      });
    const invalidTechnicalItem = filledItems.find(
      (item) =>
        (item.technicalUnitPrice ?? 0) > 0 &&
        (item.price ?? 0) > 0 &&
        (item.technicalUnitPrice ?? 0) > (item.price ?? 0)
    );
    if (invalidTechnicalItem) {
      toast.error(
        `Техничка по услуге «${invalidTechnicalItem.serviceName}» не может быть выше цены услуги`
      );
      return null;
    }
    if (!patientId || !doctorId || filledItems.length === 0) {
      toast.error("Укажите пациента, врача и услуги");
      return null;
    }

    const existingId = savedActIdRef.current ?? savedActId ?? existingActId;
    const actId = existingId ?? generateId("act");
    const actNumber = existingId
      ? (workActs.find((a) => a.id === existingId)?.actNumber ?? getNextActNumber())
      : getNextActNumber();

    const previousAct = workActs.find((a) => a.id === actId);
    const act: WorkAct = {
      id: actId,
      actNumber,
      actDate,
      patientId,
      appointmentId: linkedAppointmentId ?? previousAct?.appointmentId,
      doctorId,
      items: filledItems,
      subtotalAmount,
      discountType,
      discount: Number(discount) || 0,
      discountBearer,
      totalAmount,
      paymentStatus: previousAct?.paymentStatus ?? "pending",
      invoiceId: previousAct?.invoiceId,
      createdAt: previousAct?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
      notes: notes.trim() || undefined,
      submittedToAdmin: submittedToAdmin ?? workActs.find((a) => a.id === actId)?.submittedToAdmin,
      prepaymentId: linkedPrepaymentId ?? previousAct?.prepaymentId,
      actType: previousAct?.actType === "prepayment" ? previousAct.actType : "services",
    };

    if (existingId && workActs.some((a) => a.id === existingId)) {
      updateWorkAct(actId, act);
      syncMedicalRecordForWorkAct(act);
      rememberSavedActId(actId);
    } else {
      const invoiceId = previousAct?.invoiceId ?? generateId("inv");
      const actWithInvoice = { ...act, invoiceId };
      addWorkAct(actWithInvoice);
      if (!previousAct?.invoiceId) {
        addInvoice(createInvoiceFromWorkAct(actWithInvoice, invoiceId));
      }
      const appointment = linkedAppointmentId
        ? appointments.find((a) => a.id === linkedAppointmentId)
        : undefined;
      addMedicalRecord(
        buildMedicalRecordFromWorkAct(actWithInvoice, appointment, undefined, services)
      );
      rememberSavedActId(actId);
    }

    if (linkedAppointmentId) {
      updateAppointment(linkedAppointmentId, { workActId: actId });
    }

    return act;
  };

  const actSaveLock = useRef(false);

  const saveActViaCommand = async (options: {
    submittedToAdmin?: boolean;
    afterLocalPersist?: (act: WorkAct) => void;
    successMessage: (act: WorkAct) => string;
    closeOnSuccess?: boolean;
  }): Promise<boolean> => {
    beginClinicCommandMutation();
    try {
      const act = persistAct(options.submittedToAdmin);
      if (!act) return false;

      const apiResult = await upsertWorkActViaCommandApi({
        act,
        linkAppointmentId: linkedAppointmentId,
        ...(typeof options.submittedToAdmin === "boolean"
          ? { submittedToAdmin: options.submittedToAdmin }
          : {}),
      });
      if (!apiResult.ok) {
        toast.error(apiResult.error ?? "Не удалось сохранить акт");
        return false;
      }

      runWithoutClinicFlush(() => {
        // После успешного command API гарантируем, что локальный акт =
        // то, что ушло на сервер (скидка/сумма), а не устаревший store.
        updateWorkAct(act.id, act);
        options.afterLocalPersist?.(act);
      });
      markClinicSyncedAfterCommand(apiResult.updatedAt, apiResult.revision);

      if (
        linkedPrepaymentId &&
        prepayPath === "settle" &&
        confirmedSettleItemIds.length > 0
      ) {
        const settleApi = await settlePrepaymentViaCommandApi({
          prepaymentId: linkedPrepaymentId,
          workActId: act.id,
          itemIds: confirmedSettleItemIds,
        });
        if (!settleApi.ok) {
          toast.error(
            settleApi.error ??
              "Акт сохранён, но зачёт предоплаты не удался — повторите зачёт"
          );
          return false;
        }
        const prepNow = useClinicStore
          .getState()
          .prepayments?.find((p) => p.id === linkedPrepaymentId);
        if (prepNow) {
          runWithoutClinicFlush(() => {
            applyPrepaymentCreditLocal(act, prepNow, confirmedSettleItemIds);
          });
        }
        markClinicSyncedAfterCommand(settleApi.updatedAt, settleApi.revision);
      }

      useClinicStore.getState().pauseClinicAutoSave(15_000);
      notifyClinicDataChanged();

      toast.success(options.successMessage(act));
      if (options.closeOnSuccess) {
        onOpenChange(false);
      } else {
        refreshBaseline();
      }
      return true;
    } finally {
      endClinicCommandMutation();
    }
  };

  const handleSaveOnly = () => {
    if (actSaveLock.current) return;
    actSaveLock.current = true;
    void (async () => {
      try {
        const submittedToAdmin = mode === "doctor" ? false : undefined;
        await saveActViaCommand({
          submittedToAdmin,
          successMessage: (act) =>
            linkedPrepaymentId && prepayPath === "settle"
              ? `Акт № ${act.actNumber} сохранён, предоплата зачтена`
              : `Акт № ${act.actNumber} сохранён`,
          closeOnSuccess: mode !== "doctor",
        });
      } finally {
        actSaveLock.current = false;
      }
    })();
  };

  const handleSaveAndPrint = () => {
    if (actSaveLock.current) return;
    actSaveLock.current = true;
    void (async () => {
      try {
        const submittedToAdmin = mode === "doctor" ? false : undefined;
        await saveActViaCommand({
          submittedToAdmin,
          afterLocalPersist: (act) => {
            const patient = patients.find((p) => p.id === patientId);
            if (patient) printWorkAct(act, patient, clinicSettings);
          },
          successMessage: (act) =>
            `Акт № ${act.actNumber} сохранён и отправлен на печать`,
        });
      } finally {
        actSaveLock.current = false;
      }
    })();
  };

  const handleSubmitToAdmin = () => {
    if (actSaveLock.current) return;
    if (!linkedAppointmentId) {
      toast.error("Запись не найдена");
      return;
    }
    actSaveLock.current = true;
    beginClinicCommandMutation();
    void (async () => {
      try {
        // Сначала локальный draft под mutation lock (без PUT), затем command API.
        // Полный snapshot PUT + autoMerge раньше откатывал ready_for_payment.
        const act = persistAct(true);
        if (!act) return;

        const apiResult = await submitWorkActViaCommandApi({
          act: { ...act, submittedToAdmin: true, appointmentId: linkedAppointmentId },
          appointmentId: linkedAppointmentId,
        });
        if (!apiResult.ok) {
          toast.error(apiResult.error ?? "Не удалось отправить акт администратору");
          return;
        }

        runWithoutClinicFlush(() => {
          updateWorkAct(act.id, { submittedToAdmin: true });
          updateAppointment(linkedAppointmentId, {
            status: "ready_for_payment",
            workActId: act.id,
          });
        });
        markClinicSyncedAfterCommand(apiResult.updatedAt, apiResult.revision);
        notifyClinicDataChanged();

        toast.success("Акт отправлен администратору");
        onSubmitted?.();
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
        actSaveLock.current = false;
      }
    })();
  };

  const handleReturnAppointmentToEditing = () => {
    if (!linkedAppointmentId) {
      toast.error("Запись не найдена");
      return;
    }
    const current = appointments.find((a) => a.id === linkedAppointmentId);
    if (!current) {
      toast.error("Запись не найдена");
      return;
    }
    const { workActId: _cleared, ...withoutAct } = current;
    void _cleared;
    const next: AppointmentCommandPatch = {
      ...withoutAct,
      status: "completed",
      workActId: null,
    };
    beginClinicCommandMutation();
    void (async () => {
      try {
        const apiResult = await updateAppointmentViaCommandApi(
          linkedAppointmentId,
          next
        );
        if (!apiResult.ok) {
          toast.error(apiResult.error ?? "Не удалось вернуть запись");
          return;
        }
        runWithoutClinicFlush(() => {
          useClinicStore.setState((s) => ({
            appointments: s.appointments.map((a) =>
              a.id === linkedAppointmentId
                ? { ...detachAppointmentFromWorkAct(a), status: "completed" }
                : a
            ),
          }));
        });
        markClinicSyncedAfterCommand(apiResult.updatedAt, apiResult.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success("Запись возвращена на редактирование");
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const handleAdminFixSave = () => {
    if (actSaveLock.current) return;
    actSaveLock.current = true;
    void (async () => {
      try {
        await saveActViaCommand({
          submittedToAdmin: existingAct?.submittedToAdmin ?? true,
          afterLocalPersist: (act) => {
            if (linkedAppointmentId) {
              updateAppointment(
                linkedAppointmentId,
                {
                  status: "ready_for_payment",
                  workActId: act.id,
                },
                { skipFlush: true }
              );
            }
          },
          successMessage: (act) => `Акт № ${act.actNumber} сохранён`,
          closeOnSuccess: true,
        });
      } finally {
        actSaveLock.current = false;
      }
    })();
  };

  const navigateToPayment = (actId: string) => {
    if (onGoToPayment) {
      onOpenChange(false);
      onGoToPayment(actId);
      return;
    }
    closeDialogThenNavigate(
      () => onOpenChange(false),
      `/finance?tab=acts&payAct=${actId}`
    );
  };

  const handleGoToPayment = () => {
    // Всегда сохраняем форму (скидка/позиции) на сервер, иначе оплата
    // открывается со старым актом из store без только что введённой скидки.
    if (actSaveLock.current) return;
    actSaveLock.current = true;
    void (async () => {
      try {
        const ok = await saveActViaCommand({
          submittedToAdmin:
            mode === "doctor"
              ? false
              : (existingAct?.submittedToAdmin ??
                workActs.find((a) => a.id === (savedActIdRef.current ?? existingActId))
                  ?.submittedToAdmin ??
                true),
          successMessage: (act) => `Акт № ${act.actNumber} сохранён`,
          closeOnSuccess: false,
        });
        if (!ok) return;
        const actId = savedActIdRef.current;
        if (!actId) {
          toast.error("Сначала сохраните акт с услугами");
          return;
        }
        navigateToPayment(actId);
      } finally {
        actSaveLock.current = false;
      }
    })();
  };

  const attemptClose = () => {
    if (effectiveReadOnly || !isFormDirty()) {
      onOpenChange(false);
      return;
    }
    if (
      window.confirm(
        "Есть несохранённые изменения.\n\nЗакрыть без сохранения? Все правки будут потеряны."
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

  const title =
    mode === "doctor"
      ? "Акт оказанных услуг — заполнение врачом"
      : mode === "admin_view"
        ? actMissing
          ? "Акт не найден"
          : `Акт № ${existingAct?.actNumber || "—"} (${
            existingActFullyPaid
              ? "оплачен"
              : existingActPartiallyPaid
                ? "частично оплачен"
                : actNeedsFix
                  ? "требует заполнения"
                  : "готов к оплате"
          })`
        : "Акт оказанных услуг (РФ)";

  return (
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!existingActId && prepayPath === "pending" && openPrepaysForPatient.length > 0 && (
            <div className="space-y-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                У пациента есть предоплата
              </p>
              <p className="text-sm text-[var(--muted)]">
                Учитываются документы аванса и частично оплаченные акты (в том числе старые).
                Можно зачесть выбранные услуги или создать новый акт на другую процедуру.
              </p>
              <ul className="space-y-2">
                {openPrepaysForPatient.map((source) => (
                  <li
                    key={source.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[var(--foreground)]">
                          {source.label} · внесено {formatCurrency(source.credit)}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {source.kind === "partial_act"
                            ? "Частично оплаченный акт"
                            : "Документ предоплаты"}
                          {source.serviceNames.length
                            ? ` · ${source.serviceNames.slice(0, 3).join(", ")}`
                            : ""}
                          {source.remaining > 0
                            ? ` · остаток ${formatCurrency(source.remaining)}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => chooseOpenPrepaidSource(source)}
                      >
                        {source.kind === "partial_act"
                          ? "Открыть акт"
                          : "Зачесть предоплату"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" className="w-full" onClick={chooseNewAct}>
                Создать новый акт (другая процедура)
              </Button>
            </div>
          )}

          {!existingActId && prepayPath === "select" && linkedPrepaymentId && (
            <div className="space-y-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                Выберите услуги для зачёта
              </p>
              <p className="text-sm text-[var(--muted)]">
                В акт попадут только отмеченные позиции. Остальные останутся в предоплате
                для следующих визитов.
              </p>
              {(() => {
                const prep = (prepayments ?? []).find((p) => p.id === linkedPrepaymentId);
                if (!prep) {
                  return (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Предоплата не найдена
                    </p>
                  );
                }
                const openItems = getUnsettledPrepaymentItems(prep);
                const credit = getPrepaymentAvailableCredit(prep);
                const selectedTotal = openItems
                  .filter((it) => it.id && settleItemIds.has(it.id))
                  .reduce((sum, it) => sum + prepaymentItemLineTotal(it), 0);
                return (
                  <>
                    <p className="text-xs text-[var(--muted)]">
                      Доступно аванса: {formatCurrency(credit)}
                      {settleItemIds.size > 0
                        ? ` · выбрано на ${formatCurrency(selectedTotal)}`
                        : ""}
                    </p>
                    <ul className="max-h-64 space-y-2 overflow-y-auto">
                      {openItems.map((it) => {
                        const id = it.id!;
                        const checked = settleItemIds.has(id);
                        return (
                          <li
                            key={id}
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                          >
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={() => {
                                  setSettleItemIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{it.serviceName}</span>
                                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                                  {normalizePlanItemQuantity(it.quantity)} ×{" "}
                                  {formatCurrency(it.price)} ={" "}
                                  {formatCurrency(prepaymentItemLineTotal(it))}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSettleItemIds(
                            new Set(openItems.map((it) => it.id!).filter(Boolean))
                          )
                        }
                      >
                        Выбрать все
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSettleItemIds(new Set())}
                      >
                        Снять все
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={settleItemIds.size === 0}
                        onClick={confirmSettleItemSelection}
                      >
                        Составить акт из выбранных
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setPrepayPath("pending");
                          setLinkedPrepaymentId(null);
                          setSettleItemIds(new Set());
                        }}
                      >
                        Назад
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {(prepayPath === "pending" || prepayPath === "select") &&
          openPrepaysForPatient.length > 0 &&
          !existingActId &&
          mode !== "doctor" ? null : (
          <>
          {prepayPath === "settle" && linkedPrepaymentId && (
            <p className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-900 dark:text-teal-100">
              Режим зачёта предоплаты: в акте только выбранные услуги (
              {confirmedSettleItemIds.length}). При сохранении аванс зачтётся в счёт акта;
              невыбранные услуги останутся для следующих визитов.
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  if (!linkedPrepaymentId) return;
                  const prep = (prepayments ?? []).find(
                    (p) => p.id === linkedPrepaymentId
                  );
                  if (prep) chooseSettlePrepayment(prep);
                }}
              >
                Изменить выбор
              </button>
              <button
                type="button"
                className="ml-2 underline"
                onClick={chooseNewAct}
              >
                Сменить на новый акт
              </button>
            </p>
          )}
          {mode === "admin_view" && actMissing && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Акт не найден в данных клиники — возможно, не синхронизировался с другого
              устройства. Заполните услуги и сохраните или верните запись на редактирование.
            </p>
          )}
          {mode === "admin_view" && !actMissing && actNeedsFix && !existingActFullyPaid && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              В акте нет услуг. Добавьте услуги из прайса и сохраните перед оплатой.
            </p>
          )}
          {mode === "admin_view" && !actNeedsFix && !existingActFullyPaid && (
            <p className="text-sm text-slate-600">
              Акт заполнен врачом. Проверьте услуги и перейдите к оплате.
            </p>
          )}
          {mode === "admin_view" && existingActFullyPaid && (
            <p className="text-sm text-emerald-700">
              Акт оплачен. Можно распечатать или закрыть окно.
            </p>
          )}
          {mode === "doctor" && (
            <p className="text-sm text-slate-600">
              Заполните услуги по завершённому приёму и отправьте акт администратору.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              {effectiveReadOnly ? (
                (() => {
                  const p = patients.find((x) => x.id === patientId);
                  if (!p) {
                    return (
                      <>
                        <Label>Пациент</Label>
                        <p className="text-sm font-medium text-[var(--foreground)]">—</p>
                      </>
                    );
                  }
                  if (p.isChild) {
                    return (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label>Пациент (ребёнок)</Label>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {getFullName(p.firstName, p.lastName, p.middleName)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label>Заказчик</Label>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {getWorkActCustomerName(p)}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-1">
                      <Label>Пациент</Label>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {getFullName(p.firstName, p.lastName, p.middleName)}
                      </p>
                    </div>
                  );
                })()
              ) : (
                <>
                  <Label>Пациент</Label>
                  <PatientSearchSelect
                    patients={patients}
                    selectedPatientId={patientId}
                    onSelect={(p) => {
                      setPatientId(p.id);
                      if (!existingActId && !linkedPrepaymentId) {
                        const opens = getOpenPrepaidSources(
                          prepayments,
                          workActs,
                          payments,
                          p.id
                        );
                        if (opens.length > 0 && prepayPath === "new") {
                          setPrepayPath("pending");
                        }
                      }
                    }}
                  />
                  {(() => {
                    const p = patients.find((x) => x.id === patientId);
                    if (!p?.isChild) return null;
                    return (
                      <p className="text-xs text-[var(--muted)]">
                        В акте заказчиком будет указан представитель:{" "}
                        <strong className="text-[var(--foreground)]">
                          {getWorkActCustomerName(p)}
                        </strong>
                      </p>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Врач (исполнитель)</Label>
              <select
                className={selectClass}
                value={doctorId}
                disabled={effectiveReadOnly || (!patientId && mode === "standard")}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                <option value="">
                  {!patientId && mode === "standard"
                    ? "Сначала выберите пациента"
                    : "Выберите врача"}
                </option>
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Дата акта</Label>
              <Input
                type="date"
                value={actDate}
                disabled={effectiveReadOnly}
                onChange={(e) => setActDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <Label>Услуги</Label>
            {!effectiveReadOnly && clinicServices.length > 0 && (
              <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                <ClinicServiceSearch
                  services={clinicServices}
                  onSelect={(service) => {
                    const s = clinicServices.find((x) => x.id === service.id);
                    if (!s) return;
                    const normalized = normalizeServiceFields(s);
                    setItems((prev) => [
                      ...prev,
                      {
                        id: generateId("wai"),
                        serviceId: s.id,
                        serviceName: s.name,
                        serviceCategory: normalized.category,
                        quantity: 1,
                        price: s.price,
                        total: s.price,
                      },
                    ]);
                  }}
                  placeholder="Поиск: гигиена, имплант, коронка..."
                />
              </div>
            )}

            {visibleItems.length > 0 && (
              <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-[var(--muted)]">
                <span className="col-span-3">Услуга</span>
                <span className="col-span-2 text-center">Зуб №</span>
                <span className="col-span-2 text-center">Кол-во</span>
                <span className="col-span-2">Цена, ₽</span>
                <span className="col-span-1 text-center">Скидка, %</span>
                <span className="col-span-2" />
              </div>
            )}
            {visibleItems.map((item) => {
              const technicalOptions = item.serviceId
                ? technicalByClinicServiceId.get(item.serviceId) ?? []
                : [];
              const technicalAmount = calcWorkActItemTechnicalAmount(item);
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 items-center border-t border-[var(--border)] pt-3"
                >
                  <div className="col-span-3 min-w-0 self-center text-sm font-medium text-[var(--foreground)]">
                    {item.serviceName}
                    {!item.serviceId && !effectiveReadOnly && (
                      <span className="mt-0.5 block text-xs font-normal text-amber-700">
                        Не из прайса — замените услугу при необходимости
                      </span>
                    )}
                    {technicalAmount > 0 && (
                      <span className="mt-0.5 block text-xs font-normal text-red-700">
                        Техничка: −{formatCurrency(technicalAmount)}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2">
                    {effectiveReadOnly ? (
                      <span className="block text-center text-sm">
                        {item.toothNumber ?? "—"}
                      </span>
                    ) : (
                      <Input
                        type="number"
                        placeholder="№"
                        className={compactNumberInputClass}
                        value={item.toothNumber ?? ""}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === item.id
                                ? {
                                    ...it,
                                    toothNumber: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  }
                                : it
                            )
                          )
                        }
                      />
                    )}
                  </div>
                  <div className="col-span-2">
                    {effectiveReadOnly ? (
                      <span className="block text-center text-sm">{item.quantity}</span>
                    ) : (
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className={compactNumberInputClass}
                        value={item.quantity > 0 ? String(item.quantity) : ""}
                        placeholder="1"
                        onChange={(e) => {
                          const raw = e.target.value;
                          const qty =
                            raw === "" ? 0 : Math.max(0, Number(raw.replace(",", ".")) || 0);
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === item.id
                                ? {
                                    ...it,
                                    quantity: qty,
                                    total: qty * (it.price || 0),
                                  }
                                : it
                            )
                          );
                        }}
                        onBlur={() => {
                          setItems((prev) =>
                            prev.map((it) => {
                              if (it.id !== item.id) return it;
                              const quantity = Math.max(1, it.quantity || 1);
                              return {
                                ...it,
                                quantity,
                                total: quantity * (it.price || 0),
                              };
                            })
                          );
                        }}
                      />
                    )}
                  </div>
                  <div className="col-span-2">
                    {effectiveReadOnly ? (
                      <span className="text-sm">{formatCurrency(item.price)}</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        className={compactNumberInputClass}
                        value={item.price || ""}
                        onChange={(e) => {
                          const nextPrice = Number(e.target.value) || 0;
                          if ((item.technicalUnitPrice ?? 0) > nextPrice) {
                            setTechnicalSelectionByItemId((prev) => {
                              if (!prev[item.id]) return prev;
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                          }
                          setItems((prev) =>
                            prev.map((it) => {
                              if (it.id !== item.id) return it;
                              return {
                                ...it,
                                price: nextPrice,
                                total: (it.quantity || 1) * nextPrice,
                                technicalUnitPrice:
                                  (it.technicalUnitPrice ?? 0) > nextPrice
                                    ? undefined
                                    : it.technicalUnitPrice,
                              };
                            })
                          );
                        }}
                      />
                    )}
                  </div>
                  <div className="col-span-1">
                    {effectiveReadOnly ? (
                      <span className="block text-center text-sm">{item.discountPercent ?? 0}%</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className={compactNumberInputClass}
                        value={item.discountPercent ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === item.id
                                ? {
                                    ...it,
                                    discountPercent: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value) || 0)
                                    ),
                                  }
                                : it
                            )
                          )
                        }
                      />
                    )}
                  </div>
                  {!effectiveReadOnly && (
                    <div className="col-span-2 flex justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Дублировать услугу"
                        onClick={() => {
                          const newId = generateId("wai");
                          setItems((prev) => {
                            const idx = prev.findIndex((it) => it.id === item.id);
                            if (idx < 0) return prev;
                            const copy = { ...prev[idx], id: newId };
                            const next = [...prev];
                            next.splice(idx + 1, 0, copy);
                            return next;
                          });
                          setTechnicalSelectionByItemId((prev) => {
                            const src = prev[item.id];
                            if (!src) return prev;
                            return { ...prev, [newId]: src };
                          });
                        }}
                      >
                        <Copy className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Удалить"
                        onClick={() => {
                          setItems((prev) => prev.filter((it) => it.id !== item.id));
                          setTechnicalSelectionByItemId((prev) => {
                            if (!prev[item.id]) return prev;
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                  {!effectiveReadOnly && (
                    <div className="col-span-12 rounded-md border border-[var(--border)] bg-[var(--muted)]/5 p-2">
                      <Label className="text-xs">Техническая часть</Label>
                      {technicalOptions.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Для этой услуги не задан технический прайс
                        </p>
                      ) : (
                        <>
                          <select
                            className={`${selectClass} mt-1 h-9`}
                            value={technicalSelectionByItemId[item.id] ?? ""}
                            onChange={(e) => {
                              const selected = technicalOptions.find(
                                (opt) => opt.id === e.target.value
                              );
                              if (selected && selected.price > (item.price ?? 0)) {
                                toast.error("Техничка не может быть больше цены услуги в акте");
                                return;
                              }
                              setTechnicalSelectionByItemId((prev) => {
                                const next = { ...prev };
                                if (!selected) {
                                  delete next[item.id];
                                  return next;
                                }
                                next[item.id] = selected.id;
                                return next;
                              });
                              setItems((prev) =>
                                prev.map((it) => {
                                  if (it.id !== item.id) return it;
                                  if (!selected) {
                                    return {
                                      ...it,
                                      technicalUnitPrice: undefined,
                                    };
                                  }
                                  return {
                                    ...it,
                                    technicalUnitPrice: selected.price,
                                  };
                                })
                              );
                            }}
                          >
                            <option value="">Без технички</option>
                            {technicalOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.technicianName || "Техник"} · {opt.name} ·{" "}
                                {opt.price.toLocaleString("ru-RU")} ₽
                              </option>
                            ))}
                          </select>
                          {technicalAmount > 0 && (
                            <p className="mt-1 text-xs text-red-700">
                              Вычет по строке: −{formatCurrency(technicalAmount)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!effectiveReadOnly && visibleItems.length === 0 && (
              <p className="text-sm text-slate-500">Добавьте услуги из прайса клиники</p>
            )}
          </div>

          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Сумма услуг</span>
              <span>{formatCurrency(afterRowDiscounts)}</span>
            </div>
            {technicalTotalCapped > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">Техничка</span>
                  <span className="text-red-600">−{formatCurrency(technicalTotalCapped)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">База для ЗП врача и клиники</span>
                  <span>{formatCurrency(Math.max(0, totalAmount - technicalTotalCapped))}</span>
                </div>
              </>
            )}
            {discountValue > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">
                  Скидка {discountType === "percent" ? `${discount}%` : formatCurrency(Number(discount) || 0)}
                  {discountBearer && (
                    <span className="block text-xs">
                      {DISCOUNT_BEARER_LABELS[discountBearer]}
                    </span>
                  )}
                </span>
                <span className="text-teal-600">−{formatCurrency(discountValue)}</span>
              </div>
            )}
            {paymentPreview && (
              <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/5 px-3 py-2 text-xs text-[var(--muted)]">
                <p>
                  Техничка:{" "}
                  <strong className="text-[var(--foreground)]">
                    −{formatCurrency(paymentPreview.technicalAmount)}
                  </strong>
                  {" · "}
                  Врачу: <strong className="text-[var(--foreground)]">{formatCurrency(paymentPreview.doctorAmount)}</strong>
                  {" · "}
                  Клинике: <strong className="text-[var(--foreground)]">{formatCurrency(paymentPreview.clinicAmount)}</strong>
                </p>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-[var(--border)] pt-2">
              <span className="text-[var(--muted)]">Итого с учётом скидки</span>
              <span className="text-lg font-bold text-teal-700">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          {!effectiveReadOnly && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Доп. скидка</Label>
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
                    <Input
                      type="number"
                      min={0}
                      max={discountType === "percent" ? 100 : undefined}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Скидка списывается с</Label>
                  <select
                    className={selectClass}
                    value={discountBearer}
                    onChange={(e) =>
                      setDiscountBearer(e.target.value as DiscountBearer)
                    }
                  >
                    {(Object.entries(DISCOUNT_BEARER_LABELS) as [DiscountBearer, string][]).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                  <p className="text-xs text-[var(--muted)]">
                    {discountBearer === "doctor" &&
                      "Скидка врача: уменьшает только ЗП врача, прибыль клиники как без скидки."}
                    {discountBearer === "clinic" &&
                      "Скидка клиники: ЗП врача как без скидки (можно до 100%), скидку покрывает клиника."}
                    {discountBearer === "shared" &&
                      "Общая скидка: уменьшает и ЗП врача, и прибыль клиники пропорционально."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Примечание</Label>
            {effectiveReadOnly ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {notes.trim() || "—"}
              </p>
            ) : (
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={attemptClose}>
              {effectiveReadOnly ? "Закрыть" : "Отмена"}
            </Button>
            {effectiveReadOnly && existingAct && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const patient = patients.find((p) => p.id === existingAct.patientId);
                    if (patient) printWorkAct(existingAct, patient, clinicSettings);
                  }}
                >
                  Печать
                </Button>
                {!existingActFullyPaid && (
                  <Button onClick={() => navigateToPayment(existingAct.id)}>
                    Перейти к оплате
                  </Button>
                )}
                {canDeleteAct && (
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      const paid = existingActFullyPaid;
                      if (
                        !window.confirm(
                          paid
                            ? `Удалить оплаченный акт № ${existingAct.actNumber}? Платёж исчезнет из финансов, сумма у пациента пересчитается. Отменить нельзя.`
                            : `Удалить акт № ${existingAct.actNumber}? Это действие нельзя отменить.`
                        )
                      ) {
                        return;
                      }
                      beginClinicCommandMutation();
                      void (async () => {
                        try {
                          const apiResult = await deleteWorkActViaCommandApi(
                            existingAct.id
                          );
                          if (!apiResult.ok) {
                            toast.error(apiResult.error ?? "Не удалось удалить акт");
                            return;
                          }
                          runWithoutClinicFlush(() => {
                            deleteWorkAct(existingAct.id);
                          });
                          markClinicSyncedAfterCommand(
                            apiResult.updatedAt,
                            apiResult.revision
                          );
                          useClinicStore.getState().pauseClinicAutoSave(15_000);
                          notifyClinicDataChanged();
                          toast.success(
                            paid ? "Оплаченный акт удалён" : "Акт удалён"
                          );
                          onOpenChange(false);
                        } finally {
                          endClinicCommandMutation();
                        }
                      })();
                    }}
                  >
                    Удалить акт
                  </Button>
                )}
              </>
            )}
            {!effectiveReadOnly && mode === "admin_view" && actNeedsFix && (
              <>
                {linkedAppointmentId && (
                  <Button variant="outline" onClick={handleReturnAppointmentToEditing}>
                    Вернуть запись на редактирование
                  </Button>
                )}
                <Button onClick={handleAdminFixSave}>Сохранить акт</Button>
              </>
            )}
            {!effectiveReadOnly && mode === "admin_view" && !actNeedsFix && (
              <>
                <Button variant="outline" onClick={handleAdminFixSave}>
                  Сохранить изменения
                </Button>
                <Button onClick={handleGoToPayment}>Перейти к оплате</Button>
              </>
            )}
            {!effectiveReadOnly && mode === "doctor" && (
              <>
                <Button variant="outline" onClick={handleSaveOnly}>
                  Сохранить
                </Button>
                <Button variant="secondary" onClick={handleSaveAndPrint}>
                  Сохранить и печать
                </Button>
                <Button onClick={handleSubmitToAdmin}>Отправить администратору</Button>
              </>
            )}
            {!effectiveReadOnly && mode === "standard" && (
              <>
                <Button variant="secondary" onClick={handleSaveAndPrint}>
                  Сохранить и печать
                </Button>
                <Button onClick={handleGoToPayment}>Перейти к оплате</Button>
              </>
            )}
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
