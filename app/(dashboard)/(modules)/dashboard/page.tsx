"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  Calendar,
  DollarSign,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { AppointmentsChart } from "@/components/dashboard/appointments-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeAppointmentsChart,
  computeDashboardKPI,
  computePopularServices,
  computeRevenueChart,
  computeTopDoctors,
} from "@/lib/analytics";
import { APPOINTMENT_STATUS_LABELS, UI } from "@/lib/constants";
import { formatCurrency, formatDate, getFullName } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";

const today = format(new Date(), "yyyy-MM-dd");

export default function DashboardPage() {
  const { appointments, patients, tasks, payments, doctors, services, workActs } =
    useClinicStore();

  const dashboardKPI = useMemo(
    () => computeDashboardKPI(payments, appointments, patients, workActs, doctors),
    [payments, appointments, patients, workActs, doctors]
  );
  const revenueChartData = useMemo(
    () => computeRevenueChart(payments, workActs),
    [payments, workActs]
  );
  const appointmentsChartData = useMemo(
    () => computeAppointmentsChart(appointments),
    [appointments]
  );
  const topDoctorsRevenue = useMemo(
    () => computeTopDoctors(doctors, workActs, appointments),
    [doctors, workActs, appointments]
  );
  const popularServices = useMemo(
    () => computePopularServices(services, workActs),
    [services, workActs]
  );

  const todayAppointments = appointments
    .filter((a) => a.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const debtors = patients
    .filter((p) => p.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 5);

  const pendingTasks = tasks.filter((t) => t.status !== "completed").slice(0, 5);

  const kpis = [
    {
      label: "Выручка сегодня",
      value: formatCurrency(dashboardKPI.revenueToday),
      icon: DollarSign,
      color: "text-teal-600 bg-teal-50",
    },
    {
      label: "Выручка за месяц",
      value: formatCurrency(dashboardKPI.revenueMonth),
      icon: TrendingUp,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Приёмы сегодня",
      value: String(dashboardKPI.appointmentsToday),
      icon: Calendar,
      color: "text-sky-600 bg-sky-50",
    },
    {
      label: "Новые за месяц",
      value: String(dashboardKPI.newPatients),
      icon: UserPlus,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Долги пациентов",
      value: formatCurrency(dashboardKPI.patientDebts),
      icon: Wallet,
      color: "text-red-600 bg-red-50",
    },
    {
      label: "Средний чек",
      value: formatCurrency(dashboardKPI.averageCheck),
      icon: Users,
      color: "text-amber-600 bg-amber-50",
      subtitle: `завершение приёмов: ${dashboardKPI.primaryConversion}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Аналитика</h1>
        <p className="text-sm text-slate-500">
          Оперативный обзор клиники на сегодня и текущий месяц
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`rounded-lg p-2.5 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
                {"subtitle" in kpi && kpi.subtitle ? (
                  <p className="text-[11px] text-slate-500">{kpi.subtitle}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Выручка (30 дней)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueChartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Приёмы (14 дней)</CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentsChart data={appointmentsChartData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Записи на сегодня</CardTitle>
            <Link href="/appointments" className="text-sm text-teal-600 hover:underline">
              {UI.all}
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 p-0">
            {todayAppointments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Нет записей на сегодня</p>
            ) : (
              todayAppointments.slice(0, 6).map((apt) => {
                const patient = patients.find((p) => p.id === apt.patientId);
                const doctor = doctors.find((d) => d.id === apt.doctorId);
                return (
                  <div key={apt.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {apt.startTime} -{" "}
                        {patient
                          ? getFullName(patient.firstName, patient.lastName, patient.middleName)
                          : "-"}
                      </p>
                      <p className="text-slate-500">{doctor?.name ?? "—"}</p>
                    </div>
                    <Badge variant="outline">{APPOINTMENT_STATUS_LABELS[apt.status]}</Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Должники</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 p-0">
            {debtors.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Нет должников</p>
            ) : (
              debtors.map((p) => (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">
                    {getFullName(p.firstName, p.lastName, p.middleName)}
                  </span>
                  <span className="font-semibold text-red-600">{formatCurrency(p.balance)}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Задачи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-slate-500">Нет активных задач</p>
            ) : (
              pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {UI.dueDate}: {formatDate(task.dueDate)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Топ врачей</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topDoctorsRevenue.length === 0 ? (
              <p className="text-sm text-slate-500">Пока нет данных по врачам</p>
            ) : (
              topDoctorsRevenue.map(({ doctor, revenue, appointments: count, acts }) => (
                <div key={doctor.id} className="flex items-center justify-between text-sm">
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Популярные услуги</CardTitle>
          </CardHeader>
          <CardContent>
            {popularServices.length === 0 ? (
              <p className="text-sm text-slate-500">Пока нет данных по оплаченным актам</p>
            ) : (
              <div className="space-y-3">
                {popularServices.map((service) => (
                  <div key={service.id} className="flex items-center gap-4 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{service.name}</p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{
                            width: `${popularServices[0]?.count ? (service.count / popularServices[0].count) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{service.count}</p>
                      <p className="text-xs text-slate-500">{formatCurrency(service.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
