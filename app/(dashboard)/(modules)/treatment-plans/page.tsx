"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TreatmentPlanModal } from "@/components/treatment-plans/treatment-plan-modal";
import { PrepaymentModal } from "@/components/finance/prepayment-modal";
import { PayActDialog } from "@/components/finance/pay-act-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TREATMENT_PLAN_STATUS_LABELS, UI } from "@/lib/constants";
import { buildWorkActFromTreatmentPlan } from "@/lib/treatment-plan-finance";
import { formatCurrency, formatDate, getFullName } from "@/lib/utils";
import { logAuditClient } from "@/lib/audit-client";
import { canDeleteTreatmentPlans } from "@/lib/rbac";
import { treatmentPlansForViewer } from "@/lib/treatment-plan-access";
import { normalizePlanItemQuantity, planItemLineTotal } from "@/lib/treatment-plan-item-utils";
import { markClinicSyncedAfterCommand } from "@/lib/clinic-data-sync.client";
import {
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import type { PaymentMethod, TreatmentPlan, WorkAct } from "@/lib/types";

export default function TreatmentPlansPage() {
  const {
    treatmentPlans,
    patients,
    doctors,
    medicalRecords,
    addWorkAct,
    addInvoice,
    getNextActNumber,
    payWorkAct,
    payments,
    currentUser,
    deleteTreatmentPlan,
  } = useClinicStore();
  const canDeletePlans = canDeleteTreatmentPlans(currentUser.role);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TreatmentPlan | null>(null);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayPlan, setPrepayPlan] = useState<TreatmentPlan | null>(null);
  const [payAct, setPayAct] = useState<WorkAct | null>(null);

  const handleFullPay = (plan: TreatmentPlan) => {
    if (plan.items.length === 0) {
      toast.error("В плане нет услуг");
      return;
    }
    const { act, invoice } = buildWorkActFromTreatmentPlan(plan, getNextActNumber());
    addWorkAct(act);
    addInvoice(invoice);
    setPayAct(act);
  };

  const visiblePlans = useMemo(
    () => treatmentPlansForViewer(treatmentPlans, currentUser),
    [treatmentPlans, currentUser]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return visiblePlans.filter((plan) => {
      const patient = patients.find((p) => p.id === plan.patientId);
      const name = patient
        ? getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase()
        : "";
      return plan.title.toLowerCase().includes(q) || name.includes(q);
    });
  }, [visiblePlans, patients, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Планы лечения</h1>
          <p className="text-sm text-slate-500">Комплекс услуг с расчётом и скидкой</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Добавить план лечения
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder={UI.searchPlans}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Планов лечения пока нет. Создайте первый план — можно привязать к записи в медкарте.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((plan) => {
          const patient = patients.find((p) => p.id === plan.patientId);
          const doctor = doctors.find((d) => d.id === plan.doctorId);
          const linkedRecord = plan.medicalRecordId
            ? medicalRecords.find((r) => r.id === plan.medicalRecordId)
            : undefined;
          const discountLabel =
            (plan.discountType ?? "percent") === "percent"
              ? `${plan.discount}%`
              : formatCurrency(plan.discount);

          return (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{plan.title}</CardTitle>
                  <div className="flex gap-1">
                    <Badge variant="outline">
                      {TREATMENT_PLAN_STATUS_LABELS[plan.status]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Редактировать"
                      onClick={() => {
                        setEditing(plan);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDeletePlans && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Удалить план (только владелец)"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Удалить план «${plan.title}»?\n\nСвязанная заметка в карточке пациента будет удалена. Акты и предоплаты в разделе «Финансы» останутся. Отменить нельзя.`
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
                            if (editing?.id === plan.id) {
                              setEditing(null);
                              setModalOpen(false);
                            }
                          } else {
                            toast.error("Не удалось удалить план");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-500">
                  {patient ? (
                    <Link href={`/patients/${patient.id}`} className="text-teal-700 hover:underline">
                      {getFullName(patient.firstName, patient.lastName, patient.middleName)}
                    </Link>
                  ) : (
                    "-"
                  )}{" "}
                  · {doctor?.name} · {formatDate(plan.createdAt)}
                </p>
                {linkedRecord && (
                  <p className="text-xs text-teal-700">
                    Медкарта: {linkedRecord.diagnosis.slice(0, 50)}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-teal-700">
                  {formatCurrency(plan.finalAmount)}
                </p>
                <p className="text-xs text-slate-500">
                  Сумма {formatCurrency(plan.totalAmount)}
                  {plan.discount > 0 ? ` · скидка ${discountLabel}` : ""}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {plan.items.map((item) => {
                    const qty = normalizePlanItemQuantity(item.quantity);
                    return (
                      <li key={item.id} className="flex justify-between">
                        <span>
                          {item.toothNumber ? `#${item.toothNumber} ` : ""}
                          {item.serviceName}
                          {qty > 1 ? ` × ${qty}` : ""}
                        </span>
                        <span>{formatCurrency(planItemLineTotal(item))}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrepayPlan(plan);
                      setPrepayOpen(true);
                    }}
                  >
                    <Wallet className="h-4 w-4" />
                    Предоплата
                  </Button>
                  <Button size="sm" onClick={() => handleFullPay(plan)}>
                    <CreditCard className="h-4 w-4" />
                    Оплатить полностью
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TreatmentPlanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={editing}
        onRequestPrepayment={(plan) => {
          setPrepayPlan(plan);
          setPrepayOpen(true);
        }}
      />
      <PrepaymentModal
        open={prepayOpen}
        onOpenChange={(open) => {
          setPrepayOpen(open);
          if (!open) setPrepayPlan(null);
        }}
        defaultTreatmentPlan={prepayPlan}
      />
      <PayActDialog
        act={payAct}
        payments={payments}
        open={!!payAct}
        onOpenChange={(open) => !open && setPayAct(null)}
        onConfirm={(actId, method: PaymentMethod, amount: number) => {
          void (async () => {
            const { payWorkActViaCommandApi } = await import(
              "@/lib/clinic-work-act-pay.client"
            );
            const viaApi = await payWorkActViaCommandApi({
              actId,
              method,
              amount,
            });
            if (!viaApi.ok) {
              if (!payWorkAct(actId, method, amount)) {
                toast.error(viaApi.error ?? "Не удалось провести оплату");
                return;
              }
            } else {
              runWithoutClinicFlush(() => {
                payWorkAct(actId, method, amount);
              });
              markClinicSyncedAfterCommand(viaApi.updatedAt, viaApi.revision);
            }
            toast.success("План лечения оплачен");
            setPayAct(null);
          })();
        }}
      />
    </div>
  );
}
