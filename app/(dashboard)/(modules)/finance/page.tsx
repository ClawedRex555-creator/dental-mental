"use client";

import { useEffect, useMemo, useState } from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WorkActModal } from "@/components/finance/work-act-modal";
import { PrepaymentModal } from "@/components/finance/prepayment-modal";
import { PayActDialog } from "@/components/finance/pay-act-dialog";
import { FinanceSummaryStrip } from "@/components/finance/finance-summary-strip";
import type { PaymentMethod, WorkAct } from "@/lib/types";
import { calcDoctorPaymentForAct, calcClinicNetAfterSalaries, calcClinicNetAfterSalariesAndExpenses, computeStaffSalariesForRange, sumClinicExpensesInRange, sumPaidPaymentsInRange, sumStaffPaidExpensesInRange } from "@/lib/finance-utils";
import { calcAssistantHoursInRange, normalizeAssistantManualHours } from "@/lib/assistant-hours";
import { printPrepaymentAct } from "@/lib/prepayment-act-print";
import { printWorkAct } from "@/lib/work-act-print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, UI } from "@/lib/constants";
import { formatCurrency, formatDate, generateId, getFullName } from "@/lib/utils";
import { resolveInvoiceDisplay } from "@/lib/invoice-from-act";
import { canDeleteClinicExpenses, canDeleteWorkActs } from "@/lib/rbac";
import { requestClinicDataPull } from "@/lib/clinic-data-sync.client";
import { useClinicStore } from "@/store/useClinicStore";

type FinanceTab = "payments" | "invoices" | "acts" | "salaries" | "expenses" | "prepayments";
type Period = "day" | "week" | "month" | "custom";
type SalaryPeriod = Period;

export default function FinancePage() {
  const {
    payments,
    invoices,
    workActs,
    patients,
    doctors,
    appointments,
    updateAppointment,
    payWorkAct,
    clinicSettings,
    clinicExpenses,
    addClinicExpense,
    removeClinicExpense,
    prepayments,
    deleteWorkAct,
    currentUser,
    services,
    assistantManualHours,
    setAssistantManualHours,
    repairPaidActAppointments,
  } = useClinicStore();
  const canDeleteActs = canDeleteWorkActs(currentUser.role);
  const canDeleteExpenses = canDeleteClinicExpenses(currentUser.role);
  const [tab, setTab] = useState<FinanceTab>("payments");
  const [period, setPeriod] = useState<Period>("day");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>("month");
  const [salaryFrom, setSalaryFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [salaryTo, setSalaryTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Аренда");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expensePaidByStaffId, setExpensePaidByStaffId] = useState("");
  const [manualShiftAssistantId, setManualShiftAssistantId] = useState("");
  const [manualShiftDate, setManualShiftDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [manualShiftHours, setManualShiftHours] = useState("");
  const [actModalOpen, setActModalOpen] = useState(false);
  const [prepayModalOpen, setPrepayModalOpen] = useState(false);
  const [payAct, setPayAct] = useState<WorkAct | null>(null);

  useEffect(() => {
    requestClinicDataPull({ force: true });
    repairPaidActAppointments();
  }, [repairPaidActAppointments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (
      tabParam === "acts" ||
      tabParam === "salaries" ||
      tabParam === "payments" ||
      tabParam === "prepayments"
    ) {
      setTab(tabParam as FinanceTab);
    }
    const payActId = params.get("payAct");
    if (payActId) {
      const act = workActs.find((a) => a.id === payActId);
      if (act) {
        setTab("acts");
        if (getActPaymentStatus(act) !== "paid") {
          setPayAct(act);
        }
      }
    }
  }, [workActs]);

  const getActPaymentStatus = (act: WorkAct) =>
    act.paymentStatus ??
    (invoices.some(
      (inv) =>
        inv.workActId === act.id &&
        inv.status === "paid"
    ) ||
    invoices.some(
      (inv) =>
        inv.description.includes(act.actNumber) && inv.status === "paid"
    )
      ? "paid"
      : "pending");

  const totalPaid = useMemo(
    () => payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0),
    [payments]
  );

  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === "pending"),
    [invoices]
  );

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (period === "day") {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    if (period === "week") {
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    }
    if (period === "custom") {
      return { from: new Date(customFrom), to: endOfDay(new Date(customTo)) };
    }
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }, [period, customFrom, customTo]);

  const inPeriod = (dateStr: string) => {
    const d = new Date(dateStr);
    return d >= from && d <= to;
  };

  const { salaryRangeFrom, salaryRangeTo } = useMemo(() => {
    const now = new Date();
    if (salaryPeriod === "day") {
      return { salaryRangeFrom: startOfDay(now), salaryRangeTo: endOfDay(now) };
    }
    if (salaryPeriod === "week") {
      return {
        salaryRangeFrom: startOfWeek(now, { weekStartsOn: 1 }),
        salaryRangeTo: endOfWeek(now, { weekStartsOn: 1 }),
      };
    }
    if (salaryPeriod === "custom") {
      return {
        salaryRangeFrom: new Date(salaryFrom),
        salaryRangeTo: endOfDay(new Date(salaryTo)),
      };
    }
    return { salaryRangeFrom: startOfMonth(now), salaryRangeTo: endOfMonth(now) };
  }, [salaryPeriod, salaryFrom, salaryTo]);

  const inSalaryPeriod = (dateStr: string) => {
    const d = new Date(dateStr);
    return d >= salaryRangeFrom && d <= salaryRangeTo;
  };

  const periodPayments = payments.filter((p) => inPeriod(p.date));
  const periodActs = workActs.filter((a) => inPeriod(a.actDate));
  const periodExpensesTotal = useMemo(
    () => sumClinicExpensesInRange(clinicExpenses, from, to),
    [clinicExpenses, from, to]
  );
  const periodStaffReimbursements = useMemo(
    () => sumStaffPaidExpensesInRange(clinicExpenses, from, to),
    [clinicExpenses, from, to]
  );
  const periodRevenue = periodPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);

  const serviceActs = useMemo(
    () => workActs.filter((a) => a.actType !== "prepayment"),
    [workActs]
  );

  const normalizedAssistantManualHours = useMemo(
    () => normalizeAssistantManualHours(assistantManualHours),
    [assistantManualHours]
  );

  const periodSalaries = useMemo(
    () =>
      computeStaffSalariesForRange(
        doctors,
        serviceActs,
        appointments,
        from,
        to,
        normalizedAssistantManualHours,
        services
      ),
    [doctors, serviceActs, appointments, from, to, normalizedAssistantManualHours, services]
  );

  const periodNetAfterSalaries = calcClinicNetAfterSalaries(
    periodRevenue,
    periodSalaries
  );
  const periodNetAfterAll = calcClinicNetAfterSalariesAndExpenses(
    periodRevenue,
    periodSalaries,
    periodExpensesTotal
  );

  const salaryPeriodRevenue = useMemo(
    () => sumPaidPaymentsInRange(payments, salaryRangeFrom, salaryRangeTo),
    [payments, salaryRangeFrom, salaryRangeTo]
  );

  const salaryPeriodSalaries = useMemo(
    () =>
      computeStaffSalariesForRange(
        doctors,
        serviceActs,
        appointments,
        salaryRangeFrom,
        salaryRangeTo,
        normalizedAssistantManualHours,
        services
      ),
    [
      doctors,
      serviceActs,
      appointments,
      salaryRangeFrom,
      salaryRangeTo,
      normalizedAssistantManualHours,
      services,
    ]
  );

  const salaryPeriodExpensesTotal = useMemo(
    () => sumClinicExpensesInRange(clinicExpenses, salaryRangeFrom, salaryRangeTo),
    [clinicExpenses, salaryRangeFrom, salaryRangeTo]
  );
  const salaryPeriodStaffReimbursements = useMemo(
    () => sumStaffPaidExpensesInRange(clinicExpenses, salaryRangeFrom, salaryRangeTo),
    [clinicExpenses, salaryRangeFrom, salaryRangeTo]
  );

  const salaryPeriodNetAfterSalaries = calcClinicNetAfterSalaries(
    salaryPeriodRevenue,
    salaryPeriodSalaries
  );
  const salaryPeriodNet = calcClinicNetAfterSalariesAndExpenses(
    salaryPeriodRevenue,
    salaryPeriodSalaries,
    salaryPeriodExpensesTotal
  );

  const sortedExpenses = useMemo(
    () => [...clinicExpenses].sort((a, b) => b.date.localeCompare(a.date)),
    [clinicExpenses]
  );

  const buildClinicExpense = (receiptDataUrl?: string) => ({
    id: generateId("exp"),
    date: expenseDate,
    category: expenseCategory,
    amount: Number(expenseAmount) || 0,
    description: expenseTitle || expenseCategory,
    receiptDataUrl,
    paidByStaffId: expensePaidByStaffId || undefined,
  });

  const resetExpenseForm = () => {
    setExpenseTitle("");
    setExpenseAmount("");
    setExpensePaidByStaffId("");
    setExpenseDate(format(new Date(), "yyyy-MM-dd"));
  };

  const periodAppointments = appointments.filter((a) => inPeriod(a.date));

  const prepaymentActs = useMemo(
    () => workActs.filter((a) => a.actType === "prepayment"),
    [workActs]
  );

  const salaryActs = useMemo(
    () =>
      serviceActs.filter((a) => inSalaryPeriod(a.actDate) && a.paymentStatus === "paid"),
    [serviceActs, salaryRangeFrom, salaryRangeTo, salaryPeriod, salaryFrom, salaryTo]
  );

  const salaryAppointments = useMemo(
    () => appointments.filter((a) => inSalaryPeriod(a.date)),
    [appointments, salaryRangeFrom, salaryRangeTo, salaryPeriod, salaryFrom, salaryTo]
  );

  const salaryRows = useMemo(() => {
    return doctors
      .filter((d) => d.role === "doctor")
      .map((doctor) => {
        const acts = salaryActs.filter((a) => a.doctorId === doctor.id);
        const total = acts.reduce((s, a) => s + a.totalAmount, 0);
        const doctorAmount = acts.reduce(
          (s, a) => s + calcDoctorPaymentForAct(a, doctor, services).doctorAmount,
          0
        );
        return {
          doctor,
          acts: acts.length,
          total,
          doctorAmount,
          assistantAmount: 0,
          clinicAmount: Math.max(0, total - doctorAmount),
          doctorPercent: doctor.commissionPercent,
          assistantPercent: 0,
        };
      });
  }, [doctors, salaryActs, services]);

  const assistantSalaryRows = useMemo(() => {
    return doctors
      .filter((d) => d.role === "assistant")
      .map((assistant) => {
        const apts = salaryAppointments.filter((a) => a.assistantId === assistant.id);
        const appointmentHours = apts.reduce((s, a) => s + (a.assistantHours ?? 0), 0);
        const hours = calcAssistantHoursInRange(
          assistant.id,
          salaryAppointments,
          salaryRangeFrom,
          salaryRangeTo,
          normalizedAssistantManualHours
        );
        const rate = assistant.hourlyRate ?? 0;
        return {
          assistant,
          visits: apts.length,
          hours,
          appointmentHours,
          rate,
          total: Math.round(hours * rate),
        };
      });
  }, [
    doctors,
    salaryAppointments,
    salaryRangeFrom,
    salaryRangeTo,
    normalizedAssistantManualHours,
  ]);

  const assistantManualShiftRows = useMemo(() => {
    const rows: Array<{
      assistantId: string;
      assistantName: string;
      date: string;
      hours: number;
      rate: number;
      total: number;
    }> = [];
    for (const assistant of doctors.filter((d) => d.role === "assistant")) {
      const byDay = normalizedAssistantManualHours[assistant.id] ?? {};
      const rate = assistant.hourlyRate ?? 0;
      for (const [date, hoursStr] of Object.entries(byDay)) {
        if (!inSalaryPeriod(date)) continue;
        const hours = Number(hoursStr.replace(",", ".")) || 0;
        if (hours <= 0) continue;
        rows.push({
          assistantId: assistant.id,
          assistantName: assistant.name,
          date,
          hours,
          rate,
          total: Math.round(hours * rate),
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [doctors, normalizedAssistantManualHours, salaryRangeFrom, salaryRangeTo, salaryPeriod, salaryFrom, salaryTo]);

  const doctorSalaryDetails = useMemo(() => {
    return salaryActs
      .map((act) => {
        const doctor = doctors.find((d) => d.id === act.doctorId);
        const patient = patients.find((p) => p.id === act.patientId);
        if (!doctor || doctor.role !== "doctor") return null;
        const split = calcDoctorPaymentForAct(act, doctor, services);
        return {
          act,
          doctor,
          patient,
          ...split,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.act.actDate.localeCompare(a!.act.actDate));
  }, [salaryActs, doctors, patients, services]);

  const assistantSalaryDetails = useMemo(() => {
    return salaryAppointments
      .filter((a) => a.assistantId)
      .map((apt) => {
        const assistant = doctors.find((d) => d.id === apt.assistantId);
        const patient = patients.find((p) => p.id === apt.patientId);
        const hours = apt.assistantHours ?? 0;
        const rate = assistant?.hourlyRate ?? 0;
        return {
          apt,
          assistant,
          patient,
          hours,
          rate,
          earned: Math.round(hours * rate),
        };
      })
      .sort((a, b) => b.apt.date.localeCompare(a.apt.date));
  }, [salaryAppointments, doctors, patients]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Финансы</h1>
          <p className="text-sm text-slate-500">Платежи, счета и акты выполненных работ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrepayModalOpen(true)}>
            Предоплата
          </Button>
          <Button onClick={() => setActModalOpen(true)}>
            <FileText className="h-4 w-4" />
            Выставить акт (РФ)
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Всего получено</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-700">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Расходы за период</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              −{formatCurrency(periodExpensesTotal)}
            </p>
            {periodStaffReimbursements > 0 && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                к возмещению сотрудникам: {formatCurrency(periodStaffReimbursements)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Ожидающие счета</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingInvoices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Акты</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{workActs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Итого клинике</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-700">{formatCurrency(periodNetAfterAll)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              {(["day", "week", "month", "custom"] as Period[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  onClick={() => {
                  setPeriod(p);
                  setSalaryPeriod(p);
                }}
                >
                  {p === "day"
                    ? "День"
                    : p === "week"
                      ? "Неделя"
                      : p === "month"
                        ? "Месяц"
                        : "Период"}
                </Button>
              ))}
            </div>
            {period === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
            <p className="text-xs text-[var(--muted)]">
              {format(from, "d.MM.yyyy")} — {format(to, "d.MM.yyyy")}
            </p>
          </div>
          <FinanceSummaryStrip
            revenue={periodRevenue}
            salaries={periodSalaries}
            expensesTotal={periodExpensesTotal}
            staffReimbursements={periodStaffReimbursements}
            netAfterSalaries={periodNetAfterSalaries}
            netAfterAll={periodNetAfterAll}
            netLabel={
              period === "day"
                ? "Клинике за день (итого)"
                : "Клинике за период (итого)"
            }
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {(
          ["payments", "invoices", "acts", "salaries", "expenses", "prepayments"] as FinanceTab[]
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-teal-600 text-white"
                : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "payments"
              ? UI.payments
              : t === "invoices"
                ? UI.invoices
                : t === "acts"
                  ? "Акты"
                  : t === "salaries"
                    ? "Зарплаты"
                    : t === "prepayments"
                      ? "Предоплаты"
                      : "Расходы"}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          {tab === "salaries" ? (
            <div className="space-y-6 p-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Период зарплат</p>
                <div className="flex flex-wrap items-end gap-2">
                  {(["day", "week", "month", "custom"] as SalaryPeriod[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={salaryPeriod === p ? "default" : "outline"}
                      onClick={() => {
                        setSalaryPeriod(p);
                        setPeriod(p);
                      }}
                    >
                      {p === "day"
                        ? "День"
                        : p === "week"
                          ? "Неделя"
                          : p === "month"
                            ? "Месяц"
                            : "Свой период"}
                    </Button>
                  ))}
                  {salaryPeriod === "custom" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">С</Label>
                        <Input
                          type="date"
                          value={salaryFrom}
                          onChange={(e) => setSalaryFrom(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">По</Label>
                        <Input
                          type="date"
                          value={salaryTo}
                          onChange={(e) => setSalaryTo(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {format(salaryRangeFrom, "d.MM.yyyy")} — {format(salaryRangeTo, "d.MM.yyyy")}
                </p>
                <FinanceSummaryStrip
                  revenue={salaryPeriodRevenue}
                  salaries={salaryPeriodSalaries}
                  expensesTotal={salaryPeriodExpensesTotal}
                  staffReimbursements={salaryPeriodStaffReimbursements}
                  netAfterSalaries={salaryPeriodNetAfterSalaries}
                  netAfterAll={salaryPeriodNet}
                  netLabel={
                    salaryPeriod === "day"
                      ? "Клинике за день (итого)"
                      : "Клинике за период (итого)"
                  }
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Врачи (% от актов)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">Врач</th>
                      <th className="px-4 py-3 text-right">Актов</th>
                      <th className="px-4 py-3 text-right">Пациент заплатил</th>
                      <th className="px-4 py-3 text-right">Врачу</th>
                      <th className="px-4 py-3 text-right">Клинике</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          Нет оплаченных актов за период
                        </td>
                      </tr>
                    ) : (
                      <>
                        {salaryRows.map((row) => (
                          <tr key={row.doctor.id} className="border-b border-[var(--border)]">
                            <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                              {row.doctor.name} ({row.doctorPercent}%)
                            </td>
                            <td className="px-4 py-3 text-right">{row.acts}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(row.total)}</td>
                            <td className="px-4 py-3 text-right salary-accent">
                              {formatCurrency(row.doctorAmount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(row.clinicAmount)}
                            </td>
                          </tr>
                        ))}
                        {salaryRows.length > 0 && (
                          <tr className="bg-[var(--card)] font-semibold">
                            <td className="px-4 py-3 text-[var(--foreground)]">Итого</td>
                            <td className="px-4 py-3 text-right">
                              {salaryRows.reduce((s, r) => s + r.acts, 0)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(salaryRows.reduce((s, r) => s + r.total, 0))}
                            </td>
                            <td className="px-4 py-3 text-right salary-accent">
                              {formatCurrency(salaryPeriodSalaries.doctorSalary)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(salaryRows.reduce((s, r) => s + r.clinicAmount, 0))}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
                  Ассистенты (почасовая оплата)
                </h3>
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Итого за выбранный период: часы с приёмов + смены по дням ниже
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">Ассистент</th>
                      <th className="px-4 py-3 text-right">Приёмов</th>
                      <th className="px-4 py-3 text-right">Часов</th>
                      <th className="px-4 py-3 text-right">Ставка ₽/ч</th>
                      <th className="px-4 py-3 text-right">К выплате</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assistantSalaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          Нет ассистентов в штате
                        </td>
                      </tr>
                    ) : (
                      assistantSalaryRows.map((row) => (
                        <tr key={row.assistant.id} className="border-b border-slate-50">
                          <td className="px-4 py-3 font-medium">{row.assistant.name}</td>
                          <td className="px-4 py-3 text-right">{row.visits}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.hours}</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(row.rate)}
                          </td>
                          <td className="px-4 py-3 text-right salary-accent">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
                  Смены по дням (без приёма)
                </h3>
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Укажите дату и часы, если ассистент работал в день без записи в расписании
                </p>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label>Ассистент</Label>
                    <select
                      className="select-field min-w-[12rem]"
                      value={manualShiftAssistantId}
                      onChange={(e) => setManualShiftAssistantId(e.target.value)}
                    >
                      <option value="">Выберите</option>
                      {doctors
                        .filter((d) => d.role === "assistant")
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{UI.date}</Label>
                    <Input
                      type="date"
                      value={manualShiftDate}
                      onChange={(e) => setManualShiftDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Часов</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      className="w-24"
                      value={manualShiftHours}
                      onChange={(e) => setManualShiftHours(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!manualShiftAssistantId) {
                        toast.error("Выберите ассистента");
                        return;
                      }
                      if (!manualShiftDate) {
                        toast.error("Укажите дату");
                        return;
                      }
                      const hours = Number(manualShiftHours.replace(",", "."));
                      if (!Number.isFinite(hours) || hours <= 0) {
                        toast.error("Укажите количество часов");
                        return;
                      }
                      setAssistantManualHours(
                        manualShiftAssistantId,
                        manualShiftDate,
                        String(hours)
                      );
                      setManualShiftHours("");
                      toast.success("Смена сохранена");
                    }}
                  >
                    Добавить смену
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">{UI.date}</th>
                      <th className="px-4 py-3">Ассистент</th>
                      <th className="px-4 py-3 text-right">Часов</th>
                      <th className="px-4 py-3 text-right">Ставка</th>
                      <th className="px-4 py-3 text-right">Начислено</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {assistantManualShiftRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Нет смен за выбранный период
                        </td>
                      </tr>
                    ) : (
                      assistantManualShiftRows.map((row) => (
                        <tr key={`${row.assistantId}-${row.date}`} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(row.date)}</td>
                          <td className="px-4 py-3">{row.assistantName}</td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              className="ml-auto w-20 text-right"
                              value={row.hours > 0 ? row.hours : ""}
                              onChange={(e) =>
                                setAssistantManualHours(
                                  row.assistantId,
                                  row.date,
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.rate)}</td>
                          <td className="px-4 py-3 text-right salary-accent">
                            {formatCurrency(row.total)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setAssistantManualHours(row.assistantId, row.date, "")
                              }
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Детализация: врачи (по датам актов)
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">{UI.date}</th>
                      <th className="px-4 py-3">Врач</th>
                      <th className="px-4 py-3">{UI.patient}</th>
                      <th className="px-4 py-3">Акт</th>
                      <th className="px-4 py-3 text-right">Сумма</th>
                      <th className="px-4 py-3 text-right">Врачу</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorSalaryDetails.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Нет оплаченных актов за выбранный период
                        </td>
                      </tr>
                    ) : (
                      doctorSalaryDetails.map((row) => (
                        <tr key={row!.act.id} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(row!.act.actDate)}</td>
                          <td className="px-4 py-3">{row!.doctor.name}</td>
                          <td className="px-4 py-3">
                            {row!.patient
                              ? getFullName(
                                  row!.patient.firstName,
                                  row!.patient.lastName,
                                  row!.patient.middleName
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3">{row!.act.actNumber}</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(row!.total)}
                          </td>
                          <td className="px-4 py-3 text-right salary-accent">
                            {formatCurrency(row!.doctorAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Учёт часов ассистентов (по приёмам)
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Укажите отработанные часы для приёмов с назначенным ассистентом
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">{UI.date}</th>
                      <th className="px-4 py-3">Ассистент</th>
                      <th className="px-4 py-3">{UI.patient}</th>
                      <th className="px-4 py-3 text-right">Часов</th>
                      <th className="px-4 py-3 text-right">Ставка</th>
                      <th className="px-4 py-3 text-right">Начислено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assistantSalaryDetails.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Нет приёмов с ассистентом за период
                        </td>
                      </tr>
                    ) : (
                      assistantSalaryDetails.map((row) => (
                        <tr key={row.apt.id} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(row.apt.date)}</td>
                          <td className="px-4 py-3">{row.assistant?.name ?? "—"}</td>
                          <td className="px-4 py-3">
                            {row.patient
                              ? getFullName(
                                  row.patient.firstName,
                                  row.patient.lastName,
                                  row.patient.middleName
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              className="ml-auto w-20 text-right"
                              value={
                                row.hours > 0 ? row.hours : ""
                              }
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value;
                                updateAppointment(row.apt.id, {
                                  assistantHours:
                                    raw === ""
                                      ? undefined
                                      : Math.max(0, Number(raw.replace(",", ".")) || 0),
                                });
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.rate)}</td>
                          <td className="px-4 py-3 text-right salary-accent">
                            {formatCurrency(row.earned)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === "expenses" ? (
            <div className="p-4 space-y-4">
              <p className="text-xs text-[var(--muted)]">
                Расходы синхронизируются между компьютерами. В сводке выше учитываются только за
                выбранный период ({format(from, "d.MM.yyyy")} — {format(to, "d.MM.yyyy")}).
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Дата расхода</Label>
                  <Input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Статья</Label>
                  <Input
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Сумма, ₽</Label>
                  <Input
                    type="number"
                    min={0}
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Описание</Label>
                  <Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Оплатил сотрудник (из личных средств)</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                    value={expensePaidByStaffId}
                    onChange={(e) => setExpensePaidByStaffId(e.target.value)}
                  >
                    <option value="">Клиника / не указано</option>
                    {doctors.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {member.role === "assistant" ? " (ассистент)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                <Plus className="h-4 w-4" />
                Прикрепить чек (фото)
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file || !expenseAmount) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      addClinicExpense(buildClinicExpense(reader.result as string));
                      toast.success("Расход добавлен");
                      resetExpenseForm();
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  if (!expenseAmount) return;
                  addClinicExpense(buildClinicExpense());
                  toast.success("Расход добавлен");
                  resetExpenseForm();
                }}
              >
                Добавить расход
              </Button>
              <div className="divide-y rounded-lg border border-[var(--border)]">
                {sortedExpenses.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    Расходов пока нет
                  </p>
                ) : (
                  sortedExpenses.map((e) => {
                    const payer = e.paidByStaffId
                      ? doctors.find((d) => d.id === e.paidByStaffId)
                      : undefined;
                    const inSelectedPeriod = inPeriod(e.date);
                    return (
                      <div
                        key={e.id}
                        className={`flex justify-between gap-3 px-4 py-3 text-sm ${inSelectedPeriod ? "" : "opacity-70"}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--foreground)]">{e.description}</p>
                          <p className="text-[var(--muted)]">
                            {e.category} · {formatDate(e.date)}
                          </p>
                          {payer && (
                            <p className="mt-1 text-xs text-amber-700">
                              Оплатил: {payer.name} — к возмещению
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <span className="font-medium text-red-600">
                            −{formatCurrency(e.amount)}
                          </span>
                          {canDeleteExpenses && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Удалить расход"
                              onClick={() => {
                                removeClinicExpense(e.id);
                                toast.success("Расход удалён");
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : tab === "prepayments" ? (
            <div className="divide-y">
              {prepayments.length === 0 ? (
                <p className="px-4 py-8 text-center text-slate-500">Предоплат пока нет</p>
              ) : (
                prepayments.map((pre) => {
                  const patient = patients.find((p) => p.id === pre.patientId);
                  const act = pre.workActId
                    ? workActs.find((a) => a.id === pre.workActId)
                    : undefined;
                  const status = act ? getActPaymentStatus(act) : "paid";
                  return (
                    <div key={pre.id} className="space-y-2 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {patient
                              ? getFullName(
                                  patient.firstName,
                                  patient.lastName,
                                  patient.middleName
                                )
                              : "—"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(pre.date)}
                            {pre.actNumber ? ` · документ ${pre.actNumber}` : ""}
                          </p>
                        </div>
                        <Badge variant={status === "paid" ? "success" : "warning"}>
                          {status === "paid" ? "Аванс оплачен" : "Ожидает оплаты аванса"}
                        </Badge>
                      </div>
                      <ul className="text-sm text-slate-700">
                        {pre.items.map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>{it.serviceName}</span>
                            <span>{formatCurrency(it.price)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span>
                          План: <strong>{formatCurrency(pre.totalAmount)}</strong>
                        </span>
                        <span>
                          Внесено: <strong className="text-teal-700">{formatCurrency(pre.paidAmount)}</strong>
                        </span>
                        <span>
                          Остаток:{" "}
                          <strong className="text-amber-700">
                            {formatCurrency(pre.remainingAmount)}
                          </strong>
                        </span>
                      </div>
                      {act && status !== "paid" && (
                        <Button size="sm" onClick={() => setPayAct(act)}>
                          Оплатить аванс
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : tab === "acts" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">№ акта</th>
                  <th className="px-4 py-3 font-medium">{UI.date}</th>
                  <th className="px-4 py-3 font-medium">{UI.patient}</th>
                  <th className="px-4 py-3 font-medium">Тип</th>
                  <th className="px-4 py-3 font-medium">{UI.status}</th>
                  <th className="px-4 py-3 font-medium text-right">{UI.amount}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {workActs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Актов пока нет
                    </td>
                  </tr>
                ) : (
                  workActs.map((act) => {
                    const patient = patients.find((p) => p.id === act.patientId);
                    const status = getActPaymentStatus(act);
                    const isPaid = status === "paid";
                    const isPrepay = act.actType === "prepayment";
                    const prep = isPrepay
                      ? prepayments.find((p) => p.id === act.prepaymentId)
                      : undefined;
                    return (
                      <tr key={act.id} className="border-b border-slate-50">
                        <td className="px-4 py-3 font-medium">{act.actNumber}</td>
                        <td className="px-4 py-3">{formatDate(act.actDate)}</td>
                        <td className="px-4 py-3">
                          {patient
                            ? getFullName(
                                patient.firstName,
                                patient.lastName,
                                patient.middleName
                              )
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {isPrepay ? "Предоплата" : "Услуги"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={isPaid ? "success" : "warning"}>
                            {PAYMENT_STATUS_LABELS[status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(act.totalAmount)}
                          {isPrepay && act.plannedTotalAmount != null && (
                            <span className="block text-xs font-normal text-slate-500">
                              план {formatCurrency(act.plannedTotalAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {!isPaid && (
                              <Button size="sm" onClick={() => setPayAct(act)}>
                                Оплатить
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!patient) return;
                                if (isPrepay && prep) {
                                  printPrepaymentAct(prep, patient, clinicSettings);
                                } else {
                                  printWorkAct(act, patient, clinicSettings);
                                }
                              }}
                            >
                              Печать
                            </Button>
                            {canDeleteActs && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-200 text-red-700 hover:bg-red-50"
                                title="Удалить акт (только владелец)"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      isPaid
                                        ? `Удалить оплаченный акт № ${act.actNumber}? Платёж исчезнет из финансов, сумма у пациента пересчитается. Отменить нельзя.`
                                        : `Удалить акт № ${act.actNumber} (ожидает оплаты)? Это действие нельзя отменить.`
                                    )
                                  ) {
                                    return;
                                  }
                                  if (deleteWorkAct(act.id)) {
                                    toast.success(
                                      isPaid ? "Оплаченный акт удалён" : "Акт удалён"
                                    );
                                  } else {
                                    toast.error("Не удалось удалить акт");
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">{UI.date}</th>
                  <th className="px-4 py-3 font-medium">{UI.patient}</th>
                  {tab === "payments" ? (
                    <>
                      <th className="px-4 py-3 font-medium">{UI.method}</th>
                      <th className="px-4 py-3 font-medium">{UI.status}</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-medium">{UI.description}</th>
                      <th className="px-4 py-3 font-medium">{UI.status}</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-medium text-right">{UI.amount}</th>
                </tr>
              </thead>
              <tbody>
                {tab === "payments"
                  ? periodPayments.map((pay) => {
                      const patient = patients.find((p) => p.id === pay.patientId);
                      return (
                        <tr key={pay.id} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(pay.date)}</td>
                          <td className="px-4 py-3">
                            {patient
                              ? getFullName(
                                  patient.firstName,
                                  patient.lastName,
                                  patient.middleName
                                )
                              : "-"}
                          </td>
                          <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[pay.method]}</td>
                          <td className="px-4 py-3">
                            <Badge variant={pay.status === "paid" ? "success" : "warning"}>
                              {PAYMENT_STATUS_LABELS[pay.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(pay.amount)}
                          </td>
                        </tr>
                      );
                    })
                  : invoices.map((inv) => {
                      const patient = patients.find((p) => p.id === inv.patientId);
                      const linkedAct = inv.workActId
                        ? workActs.find((a) => a.id === inv.workActId)
                        : undefined;
                      const display = resolveInvoiceDisplay(inv, linkedAct);
                      return (
                        <tr key={inv.id} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(inv.date)}</td>
                          <td className="px-4 py-3">
                            {patient
                              ? getFullName(
                                  patient.firstName,
                                  patient.lastName,
                                  patient.middleName
                                )
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <p>{inv.description}</p>
                            {display.actNumber && (
                              <p className="text-xs text-[var(--muted)]">
                                Акт № {display.actNumber}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                inv.status === "paid"
                                  ? "success"
                                  : inv.status === "partial"
                                    ? "warning"
                                    : "warning"
                              }
                            >
                              {PAYMENT_STATUS_LABELS[inv.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {display.hasDiscount && (
                              <p className="text-xs font-normal text-[var(--muted)] line-through">
                                {formatCurrency(display.beforeDocDiscount)}
                              </p>
                            )}
                            <p>{formatCurrency(display.total)}</p>
                            {display.hasDiscount && (
                              <p className="text-xs font-normal text-teal-700">
                                скидка −{formatCurrency(display.discountValue)}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <PrepaymentModal open={prepayModalOpen} onOpenChange={setPrepayModalOpen} />
      <WorkActModal open={actModalOpen} onOpenChange={setActModalOpen} />

      <PayActDialog
        act={payAct}
        open={!!payAct}
        onOpenChange={(open) => !open && setPayAct(null)}
        onConfirm={(actId, method: PaymentMethod) => {
          const act = workActs.find((a) => a.id === actId);
          if (act && getActPaymentStatus(act) === "paid") {
            if (payWorkAct(actId, method)) {
              toast.info("Акт уже был оплачен — статус приёма в расписании обновлён");
            }
            setPayAct(null);
            return;
          }
          if (payWorkAct(actId, method)) {
            toast.success("Акт отмечен как оплаченный");
            setPayAct(null);
          } else {
            toast.error("Не удалось провести оплату");
          }
        }}
      />
    </div>
  );
}
