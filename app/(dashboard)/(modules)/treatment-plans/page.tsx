"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  CreditCard,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { TreatmentPlanModal } from "@/components/treatment-plans/treatment-plan-modal";
import { PrepaymentModal } from "@/components/finance/prepayment-modal";
import { PayActDialog } from "@/components/finance/pay-act-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TREATMENT_PLAN_STATUS_LABELS, UI } from "@/lib/constants";
import { buildWorkActFromTreatmentPlan } from "@/lib/treatment-plan-finance";
import {
  calcCaseTotals,
  plansForCase,
} from "@/lib/treatment-plan-case-utils";
import { calcPlanRemaining } from "@/lib/treatment-plan-utils";
import { formatCurrency, formatDate, generateId, getFullName } from "@/lib/utils";
import { logAuditClient } from "@/lib/audit-client";
import { canDeleteTreatmentPlans } from "@/lib/rbac";
import { treatmentPlansForViewer } from "@/lib/treatment-plan-access";
import {
  normalizePlanItemQuantity,
  planItemLineTotal,
} from "@/lib/treatment-plan-item-utils";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  deleteTreatmentPlanCaseViaCommandApi,
  deleteTreatmentPlanViaCommandApi,
  upsertTreatmentPlanCaseViaCommandApi,
} from "@/lib/clinic-entity.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import type {
  PaymentMethod,
  TreatmentPlan,
  TreatmentPlanCase,
  WorkAct,
} from "@/lib/types";

export default function TreatmentPlansPage() {
  const {
    treatmentPlans,
    treatmentPlanCases,
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
    addTreatmentPlanCase,
    deleteTreatmentPlanCase,
  } = useClinicStore();
  const canDeletePlans = canDeleteTreatmentPlans(currentUser.role);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TreatmentPlan | null>(null);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayPlan, setPrepayPlan] = useState<TreatmentPlan | null>(null);
  const [payAct, setPayAct] = useState<WorkAct | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupPatientId, setGroupPatientId] = useState("");
  const [groupTitle, setGroupTitle] = useState("Комплексное лечение");
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set());
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());

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

  const visibleCases = useMemo(() => {
    const planIds = new Set(visiblePlans.map((p) => p.id));
    return (treatmentPlanCases ?? []).filter((c) =>
      c.planIds.some((id) => planIds.has(id))
    );
  }, [treatmentPlanCases, visiblePlans]);

  const casePlanIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const c of visibleCases) {
      for (const id of c.planIds) ids.add(id);
    }
    return ids;
  }, [visibleCases]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return visiblePlans.filter((plan) => {
      if (casePlanIdSet.has(plan.id)) return false;
      const patient = patients.find((p) => p.id === plan.patientId);
      const name = patient
        ? getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase()
        : "";
      return plan.title.toLowerCase().includes(q) || name.includes(q);
    });
  }, [visiblePlans, patients, search, casePlanIdSet]);

  const filteredCases = useMemo(() => {
    const q = search.toLowerCase();
    return visibleCases.filter((c) => {
      const patient = patients.find((p) => p.id === c.patientId);
      const name = patient
        ? getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase()
        : "";
      return c.title.toLowerCase().includes(q) || name.includes(q);
    });
  }, [visibleCases, patients, search]);

  const groupCandidatePlans = useMemo(
    () =>
      visiblePlans.filter(
        (p) =>
          p.patientId === groupPatientId &&
          (!p.caseId || !visibleCases.some((c) => c.id === p.caseId))
      ),
    [visiblePlans, groupPatientId, visibleCases]
  );

  const patientsWithMultiplePlans = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of visiblePlans) {
      if (p.caseId && visibleCases.some((c) => c.id === p.caseId)) continue;
      counts.set(p.patientId, (counts.get(p.patientId) ?? 0) + 1);
    }
    return patients.filter((p) => (counts.get(p.id) ?? 0) >= 2);
  }, [visiblePlans, visibleCases, patients]);

  const toggleGroupSelect = (planId: string) => {
    setGroupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const handleCreateCase = () => {
    if (!groupPatientId) {
      toast.error("Выберите пациента");
      return;
    }
    if (groupSelected.size < 2) {
      toast.error("Выберите минимум два плана");
      return;
    }
    const caseItem: TreatmentPlanCase = {
      id: generateId("tpc"),
      patientId: groupPatientId,
      title: groupTitle.trim() || "Комплексное лечение",
      planIds: [...groupSelected],
      status: "in_progress",
      createdAt: format(new Date(), "yyyy-MM-dd"),
    };
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await upsertTreatmentPlanCaseViaCommandApi(caseItem);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось сгруппировать планы");
          return;
        }
        runWithoutClinicFlush(() => addTreatmentPlanCase(caseItem));
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success("Планы сгруппированы");
        setGroupOpen(false);
        setGroupSelected(new Set());
        setExpandedCaseIds((prev) => new Set(prev).add(caseItem.id));
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const handleUngroupCase = (caseItem: TreatmentPlanCase) => {
    if (
      !window.confirm(
        `Разгруппировать «${caseItem.title}»?\n\nСами планы лечения останутся.`
      )
    ) {
      return;
    }
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await deleteTreatmentPlanCaseViaCommandApi(caseItem.id);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось разгруппировать");
          return;
        }
        runWithoutClinicFlush(() => deleteTreatmentPlanCase(caseItem.id));
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success("Группа снята");
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const renderPlanCard = (plan: TreatmentPlan, nested = false) => {
    const patient = patients.find((p) => p.id === plan.patientId);
    const doctor = doctors.find((d) => d.id === plan.doctorId);
    const linkedRecord = plan.medicalRecordId
      ? medicalRecords.find((r) => r.id === plan.medicalRecordId)
      : undefined;
    const discountLabel =
      (plan.discountType ?? "percent") === "percent"
        ? `${plan.discount}%`
        : formatCurrency(plan.discount);
    const remaining = calcPlanRemaining(
      plan.items,
      plan.discountType ?? "percent",
      plan.discount ?? 0
    ).remainingAmount;

    return (
      <Card key={plan.id} className={nested ? "border-slate-200 shadow-none" : undefined}>
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
                        if (editing?.id === plan.id) {
                          setEditing(null);
                          setModalOpen(false);
                        }
                      } finally {
                        endClinicCommandMutation();
                      }
                    })();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {!nested && (
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
          )}
          {nested && (
            <p className="text-sm text-slate-500">
              {doctor?.name} · {formatDate(plan.createdAt)}
            </p>
          )}
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
            {remaining < plan.finalAmount
              ? ` · остаток ${formatCurrency(remaining)}`
              : ""}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {plan.items.map((item) => {
              const qty = normalizePlanItemQuantity(item.quantity);
              return (
                <li key={item.id} className="flex justify-between gap-2">
                  <span>
                    {item.status === "completed" ? "✓ " : ""}
                    {item.toothNumber ? `#${item.toothNumber} ` : ""}
                    {item.serviceName}
                    {qty > 1 ? ` × ${qty}` : ""}
                    {item.stage ? (
                      <span className="text-slate-400"> · {item.stage}</span>
                    ) : null}
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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Планы лечения</h1>
          <p className="text-sm text-slate-500">Комплекс услуг с расчётом и скидкой</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setGroupPatientId(patientsWithMultiplePlans[0]?.id ?? "");
              setGroupTitle("Комплексное лечение");
              setGroupSelected(new Set());
              setGroupOpen(true);
            }}
            disabled={patientsWithMultiplePlans.length === 0}
          >
            <FolderPlus className="h-4 w-4" />
            Сгруппировать
          </Button>
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

      {filtered.length === 0 && filteredCases.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Планов лечения пока нет. Создайте первый план — можно привязать к записи в медкарте.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filteredCases.map((caseItem) => {
          const patient = patients.find((p) => p.id === caseItem.patientId);
          const nested = plansForCase(caseItem, visiblePlans);
          const totals = calcCaseTotals(caseItem, visiblePlans);
          const expanded = expandedCaseIds.has(caseItem.id);
          return (
            <Card key={caseItem.id} className="md:col-span-2 border-teal-200">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Layers className="h-4 w-4 text-teal-700" />
                      <CardTitle className="text-base">{caseItem.title}</CardTitle>
                      <Badge variant="outline">Группа · {nested.length} плана</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {patient ? (
                        <Link
                          href={`/patients/${patient.id}`}
                          className="text-teal-700 hover:underline"
                        >
                          {getFullName(
                            patient.firstName,
                            patient.lastName,
                            patient.middleName
                          )}
                        </Link>
                      ) : (
                        "-"
                      )}{" "}
                      · {formatDate(caseItem.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedCaseIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(caseItem.id)) next.delete(caseItem.id);
                          else next.add(caseItem.id);
                          return next;
                        })
                      }
                    >
                      {expanded ? "Свернуть" : "Раскрыть"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => handleUngroupCase(caseItem)}
                    >
                      Разгруппировать
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    Итого:{" "}
                    <strong className="text-teal-700">
                      {formatCurrency(totals.finalAmount)}
                    </strong>
                  </span>
                  <span>
                    Остаток:{" "}
                    <strong>{formatCurrency(totals.remainingAmount)}</strong>
                  </span>
                </div>
              </CardHeader>
              {expanded && (
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {nested.map((plan) => renderPlanCard(plan, true))}
                </CardContent>
              )}
            </Card>
          );
        })}
        {filtered.map((plan) => renderPlanCard(plan))}
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

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Сгруппировать планы</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Пациент</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={groupPatientId}
                onChange={(e) => {
                  setGroupPatientId(e.target.value);
                  setGroupSelected(new Set());
                }}
              >
                <option value="">Выберите пациента</option>
                {patientsWithMultiplePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getFullName(p.firstName, p.lastName, p.middleName)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Название группы</Label>
              <Input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Комплексное лечение"
              />
            </div>
            <div className="space-y-2">
              <Label>Планы (минимум 2)</Label>
              {groupCandidatePlans.length === 0 ? (
                <p className="text-sm text-slate-500">
                  У пациента нет двух свободных планов для группировки
                </p>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {groupCandidatePlans.map((plan) => (
                    <li key={plan.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={groupSelected.has(plan.id)}
                          onChange={() => toggleGroupSelect(plan.id)}
                        />
                        <span>
                          <span className="font-medium">{plan.title}</span>
                          <span className="block text-xs text-slate-500">
                            {formatCurrency(plan.finalAmount)} ·{" "}
                            {TREATMENT_PLAN_STATUS_LABELS[plan.status]}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGroupOpen(false)}>
                {UI.cancel}
              </Button>
              <Button onClick={handleCreateCase}>Сгруппировать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
