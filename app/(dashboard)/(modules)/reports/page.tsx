"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { AppointmentsChart } from "@/components/dashboard/appointments-chart";
import { AnalyticsPeriodFilter } from "@/components/analytics/analytics-period-filter";
import { FinanceSummaryStrip } from "@/components/finance/finance-summary-strip";
import { useIsModuleEnabled } from "@/components/clinic/module-guard";
import {
  computeAppointmentsChartForRange,
  computeAverageCheckInRange,
  computePopularServices,
  computeRevenueChartForRange,
  computeTopDoctors,
  countAppointmentsInRange,
  countNewPatientsInRange,
  formatAnalyticsPeriodLabel,
  sumRevenueInRange,
  type AnalyticsPeriod,
} from "@/lib/analytics";
import {
  calcClinicNetAfterSalaries,
  calcClinicNetAfterSalariesAndExpenses,
  computeStaffSalariesForRange,
  EMPTY_STAFF_SALARIES,
  sumClinicExpensesInRange,
  sumStaffPaidExpensesInRange,
} from "@/lib/finance-utils";
import { normalizeAssistantManualHours } from "@/lib/assistant-hours";
import { getSalaryPeriodRange } from "@/lib/salary-period";
import { buildAnalyticsCsv, downloadCsv } from "@/lib/report-export";
import { formatCurrency } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";

export default function ReportsPage() {
  const {
    payments,
    appointments,
    patients,
    doctors,
    services,
    workActs,
    clinicExpenses,
    assistantManualHours,
  } = useClinicStore();
  const salaryModuleEnabled = useIsModuleEnabled("my_salary");

  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { from, to } = useMemo(
    () => getSalaryPeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const normalizedAssistantManualHours = useMemo(
    () => normalizeAssistantManualHours(assistantManualHours),
    [assistantManualHours]
  );

  const serviceActs = useMemo(
    () => workActs.filter((act) => act.actType !== "prepayment"),
    [workActs]
  );

  const periodRevenue = useMemo(
    () => sumRevenueInRange(payments, workActs, from, to),
    [payments, workActs, from, to]
  );
  const periodAppointments = useMemo(
    () => countAppointmentsInRange(appointments, from, to),
    [appointments, from, to]
  );
  const periodNewPatients = useMemo(
    () => countNewPatientsInRange(patients, from, to),
    [patients, from, to]
  );
  const periodAverageCheck = useMemo(
    () => computeAverageCheckInRange(workActs, from, to),
    [workActs, from, to]
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
  const periodExpensesTotal = useMemo(
    () => sumClinicExpensesInRange(clinicExpenses, from, to),
    [clinicExpenses, from, to]
  );
  const periodStaffReimbursements = useMemo(
    () => sumStaffPaidExpensesInRange(clinicExpenses, from, to),
    [clinicExpenses, from, to]
  );
  const periodNetAfterSalaries = calcClinicNetAfterSalaries(periodRevenue, periodSalaries);
  const periodNetAfterAll = calcClinicNetAfterSalariesAndExpenses(
    periodRevenue,
    periodSalaries,
    periodExpensesTotal
  );

  const revenueChartData = useMemo(
    () => computeRevenueChartForRange(payments, workActs, from, to),
    [payments, workActs, from, to]
  );
  const appointmentsChartData = useMemo(
    () => computeAppointmentsChartForRange(appointments, from, to),
    [appointments, from, to]
  );
  const topDoctorsRevenue = useMemo(
    () => computeTopDoctors(doctors, workActs, appointments, from, to),
    [doctors, workActs, appointments, from, to]
  );
  const popularServices = useMemo(
    () => computePopularServices(services, workActs, from, to),
    [services, workActs, from, to]
  );

  const periodLabel = formatAnalyticsPeriodLabel(from, to);

  const handleExport = () => {
    const csv = buildAnalyticsCsv({
      periodLabel,
      revenue: periodRevenue,
      appointments: periodAppointments,
      newPatients: periodNewPatients,
      averageCheck: periodAverageCheck,
      expensesTotal: periodExpensesTotal,
      salariesTotal: periodSalaries.totalSalaries,
      netAfterAll: periodNetAfterAll,
      topDoctors: topDoctorsRevenue,
      popularServices,
    });
    downloadCsv(`report-${format(from, "yyyy-MM-dd")}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Отчёты</h1>
          <p className="text-sm text-slate-500">
            Сводка по выбранному периоду из оплаченных актов и платежей
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Скачать CSV
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <AnalyticsPeriodFilter
            period={period}
            customFrom={customFrom}
            customTo={customTo}
            onPeriodChange={setPeriod}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
          <p className="text-xs text-slate-500">{periodLabel}</p>
          <FinanceSummaryStrip
            revenue={periodRevenue}
            salaries={periodSalaries}
            expensesTotal={periodExpensesTotal}
            staffReimbursements={periodStaffReimbursements}
            netAfterSalaries={periodNetAfterSalaries}
            netAfterAll={periodNetAfterAll}
            showSalaries={salaryModuleEnabled}
            netLabel="Итого клинике за период"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Приёмы за период</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{periodAppointments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Новые пациенты</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{periodNewPatients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Средний чек</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(periodAverageCheck)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Оплаченных актов</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {workActs.filter(
                (act) =>
                  act.actType !== "prepayment" &&
                  act.paymentStatus === "paid" &&
                  new Date(act.actDate) >= from &&
                  new Date(act.actDate) <= to
              ).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Выручка за период</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueChartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Приёмы за период</CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentsChart data={appointmentsChartData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Топ врачей</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topDoctorsRevenue.length === 0 ? (
              <p className="text-sm text-slate-500">Нет оплаченных актов за период</p>
            ) : (
              topDoctorsRevenue.map(({ doctor, revenue, appointments: count, acts }) => (
                <div key={doctor.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{doctor.name}</p>
                    <p className="text-slate-500">
                      {count} приёмов · {acts} актов
                    </p>
                  </div>
                  <span className="font-semibold text-teal-700">{formatCurrency(revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Популярные услуги</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {popularServices.length === 0 ? (
              <p className="text-sm text-slate-500">Нет услуг в оплаченных актах за период</p>
            ) : (
              popularServices.map((service) => (
                <div key={service.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-slate-500">{service.count} раз</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(service.revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
