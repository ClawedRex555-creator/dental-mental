"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { ClinicExpense, PaymentMethod, PaymentStatus, WorkAct } from "@/lib/types";
import {
  getWorkActPaidAmount,
  getPaymentReportingDate,
  filterPaymentsWithExistingWorkActs,
  isWorkActFullyPaid,
  getWorkActSalaryAccrualDate,
} from "@/lib/work-act-payment";
import { calcDoctorPaymentForAct, calcClinicNetAfterSalaries, calcClinicNetAfterSalariesAndExpenses, computeStaffSalariesForRange, sumClinicExpensesInRange, sumPaidPaymentsInRange, sumStaffPaidExpensesInRange, EMPTY_STAFF_SALARIES } from "@/lib/finance-utils";
import { useIsModuleEnabled } from "@/components/clinic/module-guard";
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
import { getOpenPrepaidSources } from "@/lib/prepayment-utils";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
  requestClinicDataPull,
} from "@/lib/clinic-data-sync.client";
import { updateAppointmentViaCommandApi } from "@/lib/clinic-appointment.client";
import { deleteWorkActViaCommandApi } from "@/lib/clinic-work-act.client";
import { payWorkActViaCommandApi } from "@/lib/clinic-work-act-pay.client";
import {
  deleteClinicExpenseViaCommandApi,
  setAssistantManualHoursViaCommandApi,
  upsertClinicExpenseViaCommandApi,
} from "@/lib/clinic-snapshot-command.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";

type FinanceTab = "payments" | "invoices" | "acts" | "salaries" | "expenses" | "prepayments";
type Period = "day" | "week" | "month" | "custom";
type SalaryPeriod = Period;

const FINANCE_TABS: FinanceTab[] = [
  "payments",
  "invoices",
  "acts",
  "salaries",
  "expenses",
  "prepayments",
];

function compareWorkActsNewestFirst(a: WorkAct, b: WorkAct): number {
  const byActDate = new Date(b.actDate).getTime() - new Date(a.actDate).getTime();
  if (byActDate !== 0) return byActDate;
  const byCreatedAt = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byCreatedAt !== 0) return byCreatedAt;
  return b.actNumber.localeCompare(a.actNumber);
}

export default function FinancePage() {
  const payments = useClinicStore((s) => s.payments);
  const invoices = useClinicStore((s) => s.invoices);
  const workActs = useClinicStore((s) => s.workActs);
  const patients = useClinicStore((s) => s.patients);
  const doctors = useClinicStore((s) => s.doctors);
  const appointments = useClinicStore((s) => s.appointments);
  const updateAppointment = useClinicStore((s) => s.updateAppointment);
  const payWorkAct = useClinicStore((s) => s.payWorkAct);
  const clinicSettings = useClinicStore((s) => s.clinicSettings);
  const clinicExpenses = useClinicStore((s) => s.clinicExpenses);
  const addClinicExpense = useClinicStore((s) => s.addClinicExpense);
  const removeClinicExpense = useClinicStore((s) => s.removeClinicExpense);
  const prepayments = useClinicStore((s) => s.prepayments);
  const deleteWorkAct = useClinicStore((s) => s.deleteWorkAct);
  const currentUser = useClinicStore((s) => s.currentUser);
  const services = useClinicStore((s) => s.services);
  const assistantManualHours = useClinicStore((s) => s.assistantManualHours);
  const setAssistantManualHours = useClinicStore((s) => s.setAssistantManualHours);
  const repairPaidActAppointments = useClinicStore((s) => s.repairPaidActAppointments);
  const salaryModuleEnabled = useIsModuleEnabled("my_salary");
  const assistantHoursSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const assistantHoursPrevious = useRef<Map<string, number | undefined>>(new Map());
  const manualHoursSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const manualHoursPrevious = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const aptTimers = assistantHoursSaveTimers.current;
    const manualTimers = manualHoursSaveTimers.current;
    return () => {
      for (const timer of aptTimers.values()) clearTimeout(timer);
      for (const timer of manualTimers.values()) clearTimeout(timer);
      aptTimers.clear();
      manualTimers.clear();
    };
  }, []);

  const persistAssistantHours = (appointmentId: string) => {
    beginClinicCommandMutation();
    void (async () => {
      try {
        const full = useClinicStore
          .getState()
          .appointments.find((a) => a.id === appointmentId);
        if (!full) return;
        const api = await updateAppointmentViaCommandApi(appointmentId, full);
        if (!api.ok) {
          const previous = assistantHoursPrevious.current.get(appointmentId);
          runWithoutClinicFlush(() => {
            updateAppointment(
              appointmentId,
              { assistantHours: previous },
              { skipFlush: true }
            );
          });
          toast.error(api.error ?? "Не удалось сохранить часы ассистента");
          return;
        }
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        assistantHoursPrevious.current.delete(appointmentId);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const scheduleAssistantHoursSave = (appointmentId: string) => {
    const existing = assistantHoursSaveTimers.current.get(appointmentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      assistantHoursSaveTimers.current.delete(appointmentId);
      persistAssistantHours(appointmentId);
    }, 600);
    assistantHoursSaveTimers.current.set(appointmentId, timer);
  };

  const manualHoursKey = (assistantId: string, date: string) => `${assistantId}::${date}`;

  const persistManualHours = (assistantId: string, date: string) => {
    const key = manualHoursKey(assistantId, date);
    beginClinicCommandMutation();
    void (async () => {
      try {
        const latestHours =
          useClinicStore.getState().assistantManualHours[assistantId]?.[date] ?? "";
        const api = await setAssistantManualHoursViaCommandApi(
          assistantId,
          date,
          latestHours
        );
        if (!api.ok) {
          const rollbackValue = manualHoursPrevious.current.get(key) ?? "";
          runWithoutClinicFlush(() => {
            setAssistantManualHours(assistantId, date, rollbackValue);
          });
          toast.error(api.error ?? "Не удалось сохранить часы ассистента");
          return;
        }
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        manualHoursPrevious.current.delete(key);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const scheduleManualHoursSave = (assistantId: string, date: string) => {
    const key = manualHoursKey(assistantId, date);
    const active = manualHoursSaveTimers.current.get(key);
    if (active) clearTimeout(active);
    const timer = setTimeout(() => {
      manualHoursSaveTimers.current.delete(key);
      persistManualHours(assistantId, date);
    }, 600);
    manualHoursSaveTimers.current.set(key, timer);
  };

  const flushManualHoursSave = (assistantId: string, date: string) => {
    const key = manualHoursKey(assistantId, date);
    const pending = manualHoursSaveTimers.current.get(key);
    if (pending) {
      clearTimeout(pending);
      manualHoursSaveTimers.current.delete(key);
      persistManualHours(assistantId, date);
      return;
    }
    if (manualHoursPrevious.current.has(key)) {
      persistManualHours(assistantId, date);
    }
  };

  const handleManualHoursChange = (
    assistantId: string,
    date: string,
    raw: string,
    options?: { immediate?: boolean }
  ) => {
    const key = manualHoursKey(assistantId, date);
    if (!manualHoursPrevious.current.has(key)) {
      const current = useClinicStore.getState().assistantManualHours[assistantId]?.[date] ?? "";
      manualHoursPrevious.current.set(key, current);
    }
    runWithoutClinicFlush(() => {
      setAssistantManualHours(assistantId, date, raw);
    });
    if (options?.immediate) {
      flushManualHoursSave(assistantId, date);
      return;
    }
    scheduleManualHoursSave(assistantId, date);
  };

  const saveClinicExpense = async (expense: ClinicExpense) => {
    beginClinicCommandMutation();
    try {
      const api = await upsertClinicExpenseViaCommandApi(expense);
      if (!api.ok) {
        toast.error(api.error ?? "Не удалось сохранить расход на сервере");
        return false;
      }
      runWithoutClinicFlush(() => {
        addClinicExpense(expense);
      });
      markClinicSyncedAfterCommand(api.updatedAt, api.revision);
      useClinicStore.getState().pauseClinicAutoSave(15_000);
      notifyClinicDataChanged();
      return true;
    } finally {
      endClinicCommandMutation();
    }
  };

  const handleAssistantHoursChange = (appointmentId: string, raw: string) => {
    const current = useClinicStore
      .getState()
      .appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    if (!assistantHoursPrevious.current.has(appointmentId)) {
      assistantHoursPrevious.current.set(appointmentId, current.assistantHours);
    }
    const nextHours =
      raw === "" ? undefined : Math.max(0, Number(raw.replace(",", ".")) || 0);
    runWithoutClinicFlush(() => {
      updateAppointment(appointmentId, { assistantHours: nextHours }, { skipFlush: true });
    });
    scheduleAssistantHoursSave(appointmentId);
  };

  const handleAssistantHoursBlur = (appointmentId: string) => {
    const pending = assistantHoursSaveTimers.current.get(appointmentId);
    if (pending) {
      clearTimeout(pending);
      assistantHoursSaveTimers.current.delete(appointmentId);
      persistAssistantHours(appointmentId);
    }
  };
  const visibleTabs = useMemo(
    () => FINANCE_TABS.filter((t) => t !== "salaries" || salaryModuleEnabled),
    [salaryModuleEnabled]
  );
  const canDeleteActs = canDeleteWorkActs(currentUser.role);
  const canDeleteExpenses = canDeleteClinicExpenses(currentUser.role);

  /** Документы аванса + частично оплаченные акты (в т.ч. старые) */
  const prepaidSources = useMemo(() => {
    const byPatient = new Map<string, ReturnType<typeof getOpenPrepaidSources>>();
    for (const p of patients) {
      const sources = getOpenPrepaidSources(prepayments, workActs, payments, p.id);
      if (sources.length) byPatient.set(p.id, sources);
    }
    return [...byPatient.values()].flat().sort((a, b) => b.date.localeCompare(a.date));
  }, [patients, prepayments, workActs, payments]);

  const [tab, setTab] = useState<FinanceTab>("payments");
  const [period, setPeriod] = useState<Period>("day");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>("day");
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
  const searchParams = useSearchParams();

  const getActPaymentStatus = (act: WorkAct): PaymentStatus => {
    if (isWorkActFullyPaid(act, payments)) return "paid";
    const paid = getWorkActPaidAmount(payments, act.id);
    if (paid > 0 || act.paymentStatus === "partial") return "partial";
    if (act.paymentStatus) return act.paymentStatus;
    if (
      invoices.some(
        (inv) => inv.workActId === act.id && inv.status === "paid"
      ) ||
      invoices.some(
        (inv) => inv.description.includes(act.actNumber) && inv.status === "paid"
      )
    ) {
      return "paid";
    }
    return "pending";
  };

  useEffect(() => {
    requestClinicDataPull({ force: true });
    repairPaidActAppointments();
  }, [repairPaidActAppointments]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "acts" ||
      (tabParam === "salaries" && salaryModuleEnabled) ||
      tabParam === "payments" ||
      tabParam === "prepayments"
    ) {
      setTab(tabParam as FinanceTab);
    }
    const payActId = searchParams.get("payAct");
    if (payActId) {
      const act = workActs.find((a) => a.id === payActId);
      if (act) {
        setTab("acts");
        if (getActPaymentStatus(act) !== "paid") {
          setPayAct(act);
        }
      }
    }
  }, [searchParams, workActs, invoices, salaryModuleEnabled]);

  useEffect(() => {
    if (!salaryModuleEnabled && tab === "salaries") {
      setTab("payments");
    }
  }, [salaryModuleEnabled, tab]);

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

  const linkedPayments = useMemo(
    () => filterPaymentsWithExistingWorkActs(payments, workActs),
    [payments, workActs]
  );

  const periodPayments = linkedPayments.filter((p) =>
    inPeriod(getPaymentReportingDate(p, workActs))
  );
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
      salaryModuleEnabled
        ? computeStaffSalariesForRange(
            doctors,
            serviceActs,
            appointments,
            from,
            to,
            normalizedAssistantManualHours,
            services,
            payments
          )
        : EMPTY_STAFF_SALARIES,
    [
      salaryModuleEnabled,
      doctors,
      serviceActs,
      appointments,
      from,
      to,
      normalizedAssistantManualHours,
      services,
      payments,
    ]
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
    () =>
      linkedPayments
        .filter(
          (p) =>
            p.status === "paid" &&
            (() => {
              const d = new Date(getPaymentReportingDate(p, workActs));
              return d >= salaryRangeFrom && d <= salaryRangeTo;
            })()
        )
        .reduce((s, p) => s + p.amount, 0),
    [linkedPayments, workActs, salaryRangeFrom, salaryRangeTo]
  );

  const salaryPeriodSalaries = useMemo(
    () =>
      salaryModuleEnabled
        ? computeStaffSalariesForRange(
            doctors,
            serviceActs,
            appointments,
            salaryRangeFrom,
            salaryRangeTo,
            normalizedAssistantManualHours,
            services,
            payments
          )
        : EMPTY_STAFF_SALARIES,
    [
      salaryModuleEnabled,
      doctors,
      serviceActs,
      appointments,
      salaryRangeFrom,
      salaryRangeTo,
      normalizedAssistantManualHours,
      services,
      payments,
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

  const actsNewestFirst = useMemo(
    () => [...workActs].sort(compareWorkActsNewestFirst),
    [workActs]
  );

  const salaryActs = useMemo(
    () =>
      serviceActs.filter((a) => {
        const accrual = getWorkActSalaryAccrualDate(a, payments);
        return accrual != null && inSalaryPeriod(accrual);
      }),
    [serviceActs, payments, salaryRangeFrom, salaryRangeTo, salaryPeriod, salaryFrom, salaryTo]
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
        let doctorAmount = 0;
        let clinicAmount = 0;
        let technicalAmount = 0;
        for (const a of acts) {
          const split = calcDoctorPaymentForAct(a, doctor, services);
          doctorAmount += split.doctorAmount;
          clinicAmount += split.clinicAmount;
          technicalAmount += split.technicalAmount;
        }
        return {
          doctor,
          acts: acts.length,
          total,
          technicalAmount,
          doctorAmount,
          assistantAmount: 0,
          clinicAmount,
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
        const accrualDate = getWorkActSalaryAccrualDate(act, payments) ?? act.actDate;
        return {
          act,
          doctor,
          patient,
          accrualDate,
          ...split,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.accrualDate.localeCompare(a!.accrualDate));
  }, [salaryActs, doctors, patients, services, payments]);

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
            showSalaries={salaryModuleEnabled}
            netLabel={
              period === "day"
                ? "Клинике за день (итого)"
                : "Клинике за период (итого)"
            }
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {visibleTabs.map((t) => (
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
          {tab === "salaries" && salaryModuleEnabled ? (
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
                <h3 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
                  Врачи (% от актов после технички)
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">Врач</th>
                      <th className="px-4 py-3 text-right">Актов</th>
                      <th className="px-4 py-3 text-right">Пациент заплатил</th>
                      <th className="px-4 py-3 text-right">Техничка</th>
                      <th className="px-4 py-3 text-right">Врачу</th>
                      <th className="px-4 py-3 text-right">Клинике</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
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
                            <td className="px-4 py-3 text-right text-red-600">
                              −{formatCurrency(row.technicalAmount)}
                            </td>
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
                            <td className="px-4 py-3 text-right text-red-600">
                              −
                              {formatCurrency(
                                salaryRows.reduce((s, r) => s + r.technicalAmount, 0)
                              )}
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
                      handleManualHoursChange(
                        manualShiftAssistantId,
                        manualShiftDate,
                        String(hours),
                        { immediate: true }
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
                                handleManualHoursChange(
                                  row.assistantId,
                                  row.date,
                                  e.target.value
                                )
                              }
                              onBlur={() => flushManualHoursSave(row.assistantId, row.date)}
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
                                handleManualHoursChange(
                                  row.assistantId,
                                  row.date,
                                  "",
                                  { immediate: true }
                                )
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
                  Детализация: врачи (по дате полной оплаты)
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-4 py-3">{UI.date}</th>
                      <th className="px-4 py-3">Врач</th>
                      <th className="px-4 py-3">{UI.patient}</th>
                      <th className="px-4 py-3">Акт</th>
                      <th className="px-4 py-3 text-right">Сумма</th>
                      <th className="px-4 py-3 text-right">Техничка</th>
                      <th className="px-4 py-3 text-right">Врачу</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorSalaryDetails.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Нет полностью оплаченных актов за выбранный период
                        </td>
                      </tr>
                    ) : (
                      doctorSalaryDetails.map((row) => (
                        <tr key={row!.act.id} className="border-b border-slate-50">
                          <td className="px-4 py-3">{formatDate(row!.accrualDate)}</td>
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
                          <td className="px-4 py-3 text-right text-red-600">
                            −{formatCurrency(row!.technicalAmount)}
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
                                handleAssistantHoursChange(row.apt.id, e.target.value);
                              }}
                              onBlur={() => handleAssistantHoursBlur(row.apt.id)}
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
                      void (async () => {
                        const ok = await saveClinicExpense(
                          buildClinicExpense(reader.result as string)
                        );
                        if (!ok) return;
                        toast.success("Расход добавлен");
                        resetExpenseForm();
                      })();
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  if (!expenseAmount) return;
                  void (async () => {
                    const ok = await saveClinicExpense(buildClinicExpense());
                    if (!ok) return;
                    toast.success("Расход добавлен");
                    resetExpenseForm();
                  })();
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
                                void (async () => {
                                  beginClinicCommandMutation();
                                  try {
                                    const api = await deleteClinicExpenseViaCommandApi(e.id);
                                    if (!api.ok) {
                                      toast.error(api.error ?? "Не удалось удалить расход");
                                      return;
                                    }
                                    runWithoutClinicFlush(() => {
                                      removeClinicExpense(e.id);
                                    });
                                    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
                                    useClinicStore.getState().pauseClinicAutoSave(15_000);
                                    notifyClinicDataChanged();
                                    toast.success("Расход удалён");
                                  } finally {
                                    endClinicCommandMutation();
                                  }
                                })();
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
              {prepaidSources.length === 0 ? (
                <p className="px-4 py-8 text-center text-slate-500">
                  Нет открытых предоплат и частично оплаченных актов
                </p>
              ) : (
                prepaidSources.map((source) => {
                  const patient = patients.find((p) => p.id === source.patientId);
                  const act = source.act;
                  return (
                    <div key={source.id} className="space-y-2 px-4 py-4">
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
                            {formatDate(source.date)} · {source.label}
                            {source.kind === "partial_act"
                              ? " · частично оплаченный акт"
                              : " · документ предоплаты"}
                          </p>
                        </div>
                        <Badge variant="warning">
                          {source.kind === "partial_act"
                            ? "Предоплата (частичная оплата)"
                            : source.remaining > 0
                              ? "Аванс / остаток плана"
                              : "Аванс"}
                        </Badge>
                      </div>
                      {source.serviceNames.length > 0 && (
                        <ul className="text-sm text-slate-700">
                          {source.serviceNames.slice(0, 6).map((name, i) => (
                            <li key={`${source.id}-${i}`}>{name}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span>
                          Внесено:{" "}
                          <strong className="text-teal-700">
                            {formatCurrency(source.credit)}
                          </strong>
                        </span>
                        <span>
                          Остаток:{" "}
                          <strong className="text-amber-700">
                            {formatCurrency(source.remaining)}
                          </strong>
                        </span>
                      </div>
                      {act && source.remaining > 0 && (
                        <Button size="sm" onClick={() => setPayAct(act)}>
                          {source.kind === "partial_act"
                            ? "Доплатить по акту"
                            : "Оплатить аванс"}
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
                  actsNewestFirst.map((act) => {
                    const patient = patients.find((p) => p.id === act.patientId);
                    const status = getActPaymentStatus(act);
                    const isPaid = status === "paid";
                    const paidSoFar = getWorkActPaidAmount(payments, act.id);
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
                          {status === "partial" && paidSoFar > 0 && (
                            <span className="block text-xs font-normal text-slate-500">
                              внесено {formatCurrency(paidSoFar)}
                            </span>
                          )}
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
                                {act.totalAmount <= 0 ? "Закрыть" : "Оплатить"}
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
                                  beginClinicCommandMutation();
                                  void (async () => {
                                    try {
                                      const apiResult =
                                        await deleteWorkActViaCommandApi(act.id);
                                      if (!apiResult.ok) {
                                        toast.error(
                                          apiResult.error ?? "Не удалось удалить акт"
                                        );
                                        return;
                                      }
                                      runWithoutClinicFlush(() => {
                                        deleteWorkAct(act.id);
                                      });
                                      markClinicSyncedAfterCommand(
                                        apiResult.updatedAt,
                                        apiResult.revision
                                      );
                                      useClinicStore
                                        .getState()
                                        .pauseClinicAutoSave(15_000);
                                      notifyClinicDataChanged();
                                      toast.success(
                                        isPaid
                                          ? "Оплаченный акт удалён"
                                          : "Акт удалён"
                                      );
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
                          <td className="px-4 py-3">{formatDate(getPaymentReportingDate(pay, workActs))}</td>
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
        payments={payments}
        open={!!payAct}
        onOpenChange={(open) => !open && setPayAct(null)}
        onConfirm={(actId, method: PaymentMethod, amount: number) => {
          void (async () => {
            const act = workActs.find((a) => a.id === actId);
            const dueBefore = act
              ? act.totalAmount - getWorkActPaidAmount(payments, actId)
              : 0;

            if (act && getActPaymentStatus(act) === "paid") {
              if (payWorkAct(actId, method, amount)) {
                toast.info("Акт уже был оплачен — статус приёма в расписании обновлён");
              }
              setPayAct(null);
              return;
            }

            const viaApi = await payWorkActViaCommandApi({
              actId,
              method,
              amount,
            });
            if (!viaApi.ok) {
              // Fallback только при сбое API: локальный снимок + обычный sync flush
              if (!payWorkAct(actId, method, amount)) {
                toast.error(viaApi.error ?? "Не удалось провести оплату");
                return;
              }
            } else {
              // Сначала store, потом baseline — иначе CAS уезжает, а UI остаётся «не оплачен»
              runWithoutClinicFlush(() => {
                payWorkAct(actId, method, amount);
              });
              markClinicSyncedAfterCommand(viaApi.updatedAt, viaApi.revision);
            }

            toast.success(
              act && act.totalAmount <= 0
                ? "Нулевой акт закрыт — ЗП врача начислена"
                : amount > 0 && amount < dueBefore
                  ? "Предоплата по акту внесена — ЗП начислится после полной оплаты"
                  : "Акт оплачен полностью — ЗП врача начислена"
            );
            setPayAct(null);
          })();
        }}
      />
    </div>
  );
}
