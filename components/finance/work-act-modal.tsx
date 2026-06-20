"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, WorkAct, WorkActItem } from "@/lib/types";
import { createInvoiceFromWorkAct } from "@/lib/invoice-from-act";
import { normalizeServiceFields } from "@/lib/service-categories";
import { calcWorkActAmounts } from "@/lib/work-act-utils";
import { printWorkAct } from "@/lib/work-act-print";
import { canDeleteWorkActs } from "@/lib/rbac";
import { useClinicStore } from "@/store/useClinicStore";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
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
    addWorkAct,
    updateWorkAct,
    addInvoice,
    addMedicalRecord,
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

  const canDeleteAct = canDeleteWorkActs(currentUser.role) && Boolean(existingAct);

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [actDate, setActDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<WorkActItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [savedActId, setSavedActId] = useState<string | null>(null);
  const initialized = useRef(false);

  const { subtotalAmount, afterRowDiscounts, totalAmount, discountValue } = useMemo(
    () => calcWorkActAmounts(items, discountType, Number(discount) || 0),
    [items, discountType, discount]
  );

  const loadFromAct = (act: WorkAct) => {
    setPatientId(act.patientId);
    setDoctorId(act.doctorId ?? "");
    setActDate(act.actDate);
    setItems(act.items);
    setDiscountType(act.discountType ?? "percent");
    setDiscount(String(act.discount ?? 0));
    setNotes(act.notes ?? "");
    setSavedActId(act.id);
  };

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setSavedActId(null);
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (existingAct) {
      loadFromAct(existingAct);
      return;
    }

    setPatientId(defaultPatientId ?? patients[0]?.id ?? "");
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
      const svc = apt ? services.find((s) => s.id === apt.serviceId) : undefined;
      if (apt) {
        const normalized = svc ? normalizeServiceFields(svc) : null;
        setItems([
          {
            id: generateId("wai"),
            serviceId: svc?.id,
            serviceName: svc?.name ?? apt.reason ?? "Стоматологические услуги",
            serviceCategory: normalized?.category,
            quantity: 1,
            price: apt.price,
            total: apt.price,
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
      .filter((i) => i.serviceId && i.serviceName.trim())
      .map((i) => {
        const quantity = Math.max(1, i.quantity || 1);
        return {
          ...i,
          quantity,
          total: quantity * (i.price || 0),
        };
      });
    if (!patientId || !doctorId || filledItems.length === 0) {
      toast.error("Укажите пациента, врача и услуги из прайса");
      return null;
    }

    const actId = savedActId ?? generateId("act");
    const actNumber = savedActId
      ? (workActs.find((a) => a.id === savedActId)?.actNumber ?? getNextActNumber())
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
      totalAmount,
      paymentStatus: "pending",
      invoiceId: workActs.find((a) => a.id === actId)?.invoiceId,
      createdAt: format(new Date(), "yyyy-MM-dd"),
      notes: notes.trim() || undefined,
      submittedToAdmin: submittedToAdmin ?? workActs.find((a) => a.id === actId)?.submittedToAdmin,
    };

    if (savedActId) {
      updateWorkAct(actId, act);
      setSavedActId(actId);
      return act;
    } else {
      const invoiceId = generateId("inv");
      const actWithInvoice = { ...act, invoiceId };
      addWorkAct(actWithInvoice);
      addInvoice(createInvoiceFromWorkAct(actWithInvoice, invoiceId));
      const servicesList = filledItems.map((i) => i.serviceName).join("; ");
      addMedicalRecord({
        id: generateId("mr"),
        patientId,
        doctorId,
        appointmentId: defaultAppointmentId,
        workActId: actId,
        complaints: "По акту оказанных услуг",
        diagnosis: "Оказаны стоматологические услуги",
        treatment: servicesList,
        recommendations: `Акт № ${actNumber} от ${actDate}. Итого: ${totalAmount} ₽`,
        createdAt: actDate,
        serviceName: servicesList,
      });
      setSavedActId(actId);
    }

    if (defaultAppointmentId) {
      updateAppointment(defaultAppointmentId, { workActId: actId });
    }

    return act;
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
    const actId = savedActId ?? persistAct()?.id;
    if (!actId) return;
    onOpenChange(false);
    router.push(`/finance?tab=acts&payAct=${actId}`);
  };

  const title =
    mode === "doctor"
      ? "Акт оказанных услуг — заполнение врачом"
      : mode === "admin_view"
        ? `Акт № ${existingAct?.actNumber ?? ""} (готов к оплате)`
        : "Акт оказанных услуг (РФ)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "admin_view" && (
            <p className="text-sm text-slate-600">
              Акт заполнен врачом. Проверьте услуги и перейдите к оплате.
            </p>
          )}
          {mode === "doctor" && (
            <p className="text-sm text-slate-600">
              Заполните услуги по завершённому приёму и отправьте акт администратору.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Врач (исполнитель)</Label>
              <select
                className={selectClass}
                value={doctorId}
                disabled={readOnly}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                <option value="">Выберите врача</option>
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Пациент</Label>
              <select
                className={selectClass}
                value={patientId}
                disabled={readOnly}
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

            {items.some((i) => i.serviceId) && (
              <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-[var(--muted)]">
                <span className="col-span-4">Услуга</span>
                <span className="col-span-2 text-center">Кол-во</span>
                <span className="col-span-2">Цена, ₽</span>
                <span className="col-span-2">Скидка, %</span>
                <span className="col-span-2" />
              </div>
            )}
            {items
              .filter((item) => item.serviceId)
              .map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-center border-t border-[var(--border)] pt-3"
              >
                <div className="col-span-4 min-w-0 self-center text-sm font-medium text-[var(--foreground)]">
                  {item.serviceName}
                </div>
                <div className="col-span-2">
                  {readOnly ? (
                    <span className="text-sm">{item.quantity}</span>
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      className="text-center"
                      value={item.quantity > 0 ? item.quantity : ""}
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
                <div className="col-span-2">
                  {readOnly ? (
                    <span className="text-sm">{item.discountPercent ?? 0}%</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={100}
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
            {!readOnly && !items.some((i) => i.serviceId) && (
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
                </span>
                <span className="text-teal-600">−{formatCurrency(discountValue)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-[var(--border)] pt-2">
              <span className="text-[var(--muted)]">Итого с учётом скидки</span>
              <span className="text-lg font-bold text-teal-700">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            {!readOnly && (
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
            )}
          </div>

          {!readOnly && (
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}

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
                <Button onClick={() => router.push(`/finance?tab=acts&payAct=${existingAct.id}`)}>
                  Перейти к оплате
                </Button>
                {canDeleteAct && (
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      const paid = existingAct.paymentStatus === "paid";
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
                <Button onClick={savedActId ? handleGoToPayment : () => {
                  const act = persistAct();
                  if (act) {
                    toast.success(`Акт № ${act.actNumber} сохранён`);
                    onOpenChange(false);
                  }
                }}>
                  {savedActId ? "Перейти к оплате" : "Сохранить акт"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
