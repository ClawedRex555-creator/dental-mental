"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DiscountBearer, DiscountType, WorkAct, WorkActItem } from "@/lib/types";
import { DISCOUNT_BEARER_LABELS } from "@/lib/constants";
import { calcDoctorPaymentForAct } from "@/lib/finance-utils";
import { createInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import { normalizeServiceFields } from "@/lib/service-categories";
import {
  buildWorkActMedicalRecommendations,
  calcWorkActAmounts,
  getWorkActCustomerName,
  isWorkActLineFilled,
} from "@/lib/work-act-utils";
import { buildMedicalRecordFromWorkAct } from "@/lib/work-act-medical-record";
import { printWorkAct } from "@/lib/work-act-print";
import {
  getWorkActPaidAmount,
  isWorkActFullyPaid,
} from "@/lib/work-act-payment";
import { canDeleteWorkActs } from "@/lib/rbac";
import { useClinicStore } from "@/store/useClinicStore";
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
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]";

const compactNumberInputClass =
  "min-w-[4rem] text-center px-2 text-sm text-[var(--foreground)] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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
}: WorkActModalProps) {
  const router = useRouter();
  const {
    patients,
    doctors,
    appointments,
    services,
    clinicSettings,
    workActs,
    payments,
    addWorkAct,
    updateWorkAct,
    addInvoice,
    addMedicalRecord,
    syncMedicalRecordForWorkAct,
    updateAppointment,
    getNextActNumber,
    deleteWorkAct,
    currentUser,
  } = useClinicStore();
  const activeDoctors = doctors.filter((d) => d.role === "doctor");
  const readOnly = mode === "admin_view";

  const existingAct = existingActId
    ? workActs.find((a) => a.id === existingActId)
    : undefined;

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

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [actDate, setActDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<WorkActItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState("0");
  const [discountBearer, setDiscountBearer] = useState<DiscountBearer>("shared");
  const [notes, setNotes] = useState("");
  const [savedActId, setSavedActId] = useState<string | null>(null);
  const savedActIdRef = useRef<string | null>(null);
  const initialized = useRef(false);

  const rememberSavedActId = (actId: string) => {
    savedActIdRef.current = actId;
    setSavedActId(actId);
  };

  const visibleItems = useMemo(() => items.filter(isWorkActLineFilled), [items]);

  const { subtotalAmount, afterRowDiscounts, totalAmount, discountValue } = useMemo(
    () => calcWorkActAmounts(items, discountType, Number(discount) || 0),
    [items, discountType, discount]
  );

  const paymentPreview = useMemo(() => {
    if (!doctorId || discountValue <= 0) return null;
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
    discountValue,
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
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (existingAct) {
      loadFromAct(existingAct);
      return;
    }

    setPatientId(defaultPatientId ?? "");
    setDoctorId(
      defaultDoctorId ??
        appointments.find((a) => a.id === defaultAppointmentId)?.doctorId ??
        activeDoctors[0]?.id ??
        ""
    );
    setActDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
    setDiscountType("percent");
    setDiscount("0");
    setDiscountBearer("shared");
    savedActIdRef.current = null;
    setSavedActId(null);

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

    if (defaultItems?.length) {
      setItems(defaultItems.map(mapDefault));
    } else if (defaultAppointmentId) {
      const apt = appointments.find((a) => a.id === defaultAppointmentId);
      const svc = apt?.serviceId
        ? services.find((s) => s.id === apt.serviceId)
        : undefined;
      if (svc) {
        const normalized = normalizeServiceFields(svc);
        setItems([
          {
            id: generateId("wai"),
            serviceId: svc.id,
            serviceName: svc.name,
            serviceCategory: normalized.category,
            quantity: 1,
            price: apt!.price > 0 ? apt!.price : svc.price,
            total: apt!.price > 0 ? apt!.price : svc.price,
          },
        ]);
      } else {
        setItems([]);
      }
    } else {
      setItems([]);
    }
  }, [
    open,
    defaultPatientId,
    defaultAppointmentId,
    defaultItems,
    existingAct,
    patients,
    appointments,
    services,
    defaultDoctorId,
    activeDoctors,
  ]);

  const persistAct = (submittedToAdmin?: boolean): WorkAct | null => {
    const filledItems = items
      .filter(isWorkActLineFilled)
      .map((i) => {
        const quantity = Math.max(1, i.quantity || 1);
        return {
          ...i,
          quantity,
          total: quantity * (i.price || 0),
        };
      });
    if (!patientId || !doctorId || filledItems.length === 0) {
      toast.error("Укажите пациента, врача и услуги");
      return null;
    }

    const existingId = savedActIdRef.current ?? savedActId;
    const actId = existingId ?? generateId("act");
    const actNumber = existingId
      ? (workActs.find((a) => a.id === existingId)?.actNumber ?? getNextActNumber())
      : getNextActNumber();

    const act: WorkAct = {
      id: actId,
      actNumber,
      actDate,
      patientId,
      appointmentId: defaultAppointmentId,
      doctorId,
      items: filledItems,
      subtotalAmount,
      discountType,
      discount: Number(discount) || 0,
      discountBearer,
      totalAmount,
      paymentStatus: "pending",
      invoiceId: workActs.find((a) => a.id === actId)?.invoiceId,
      createdAt: format(new Date(), "yyyy-MM-dd"),
      notes: notes.trim() || undefined,
      submittedToAdmin: submittedToAdmin ?? workActs.find((a) => a.id === actId)?.submittedToAdmin,
    };

    if (existingId) {
      updateWorkAct(actId, act);
      syncMedicalRecordForWorkAct(act);
      rememberSavedActId(actId);
      return act;
    } else {
      const invoiceId = generateId("inv");
      const actWithInvoice = { ...act, invoiceId };
      addWorkAct(actWithInvoice);
      addInvoice(createInvoiceFromWorkAct(actWithInvoice, invoiceId));
      const appointment = defaultAppointmentId
        ? appointments.find((a) => a.id === defaultAppointmentId)
        : undefined;
      addMedicalRecord(buildMedicalRecordFromWorkAct(actWithInvoice, appointment));
      rememberSavedActId(actId);
    }

    if (defaultAppointmentId) {
      updateAppointment(defaultAppointmentId, { workActId: actId });
    }

    return act;
  };

  const handleSaveOnly = () => {
    const act = persistAct(mode === "doctor" ? false : undefined);
    if (!act) return;
    toast.success(`Акт № ${act.actNumber} сохранён`);
    if (mode !== "doctor") onOpenChange(false);
  };

  const handleSaveAndPrint = () => {
    const act = persistAct(mode === "doctor" ? false : undefined);
    if (!act) return;
    const patient = patients.find((p) => p.id === patientId);
    if (patient) printWorkAct(act, patient, clinicSettings);
    toast.success(`Акт № ${act.actNumber} сохранён и отправлен на печать`);
  };

  const handleSubmitToAdmin = () => {
    const act = persistAct(true);
    if (!act || !defaultAppointmentId) return;
    updateWorkAct(act.id, { submittedToAdmin: true });
    updateAppointment(defaultAppointmentId, {
      status: "ready_for_payment",
      workActId: act.id,
    });
    toast.success("Акт отправлен администратору");
    onSubmitted?.();
    onOpenChange(false);
  };

  const handleGoToPayment = () => {
    const existingId = savedActIdRef.current;
    const act = existingId
      ? (workActs.find((a) => a.id === existingId) ?? persistAct())
      : persistAct();
    const actId = act?.id ?? savedActIdRef.current;
    if (!actId) return;
    onOpenChange(false);
    router.push(`/finance?tab=acts&payAct=${actId}`);
  };

  const title =
    mode === "doctor"
      ? "Акт оказанных услуг — заполнение врачом"
      : mode === "admin_view"
        ? `Акт № ${existingAct?.actNumber ?? ""} (${
            existingActFullyPaid
              ? "оплачен"
              : existingActPartiallyPaid
                ? "частично оплачен"
                : "готов к оплате"
          })`
        : "Акт оказанных услуг (РФ)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "admin_view" && !existingActFullyPaid && (
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
              {readOnly ? (
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
                    placeholder="ФИО или телефон..."
                    onSelect={(p) => setPatientId(p.id)}
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
                disabled={readOnly || (!patientId && mode === "standard")}
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
                disabled={readOnly}
                onChange={(e) => setActDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <Label>Услуги</Label>
            {!readOnly && services.length > 0 && (
              <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                <ClinicServiceSearch
                  services={services}
                  onSelect={(service) => {
                    const s = services.find((x) => x.id === service.id);
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
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-center border-t border-[var(--border)] pt-3"
              >
                <div className="col-span-3 min-w-0 self-center text-sm font-medium text-[var(--foreground)]">
                  {item.serviceName}
                  {!item.serviceId && !readOnly && (
                    <span className="mt-0.5 block text-xs font-normal text-amber-700">
                      Не из прайса — замените услугу при необходимости
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  {readOnly ? (
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
                  {readOnly ? (
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
                  {readOnly ? (
                    <span className="text-sm">{formatCurrency(item.price)}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      className={compactNumberInputClass}
                      value={item.price || ""}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id
                              ? {
                                  ...it,
                                  price: Number(e.target.value) || 0,
                                  total: (it.quantity || 1) * (Number(e.target.value) || 0),
                                }
                              : it
                          )
                        )
                      }
                    />
                  )}
                </div>
                <div className="col-span-1">
                  {readOnly ? (
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
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-2 justify-self-end"
                    onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            {!readOnly && visibleItems.length === 0 && (
              <p className="text-sm text-slate-500">Добавьте услуги из прайса клиники</p>
            )}
          </div>

          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Сумма услуг</span>
              <span>{formatCurrency(afterRowDiscounts)}</span>
            </div>
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
          {!readOnly && (
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
                      "Вся доп. скидка уменьшает вознаграждение врача."}
                    {discountBearer === "clinic" &&
                      "Врач получает % как без доп. скидки, скидку покрывает клиника."}
                    {discountBearer === "shared" &&
                      "Скидка делится между врачом и клиникой пропорционально их долям."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Примечание</Label>
            {readOnly ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {notes.trim() || "—"}
              </p>
            ) : (
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "Закрыть" : "Отмена"}
            </Button>
            {readOnly && existingAct && (
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
                  <Button onClick={() => router.push(`/finance?tab=acts&payAct=${existingAct.id}`)}>
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
                      if (deleteWorkAct(existingAct.id)) {
                        toast.success(paid ? "Оплаченный акт удалён" : "Акт удалён");
                        onOpenChange(false);
                      } else {
                        toast.error("Не удалось удалить акт");
                      }
                    }}
                  >
                    Удалить акт
                  </Button>
                )}
              </>
            )}
            {!readOnly && mode === "doctor" && (
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
            {!readOnly && mode === "standard" && (
              <>
                <Button variant="secondary" onClick={handleSaveAndPrint}>
                  Сохранить и печать
                </Button>
                <Button onClick={handleGoToPayment}>Перейти к оплате</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
