"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { AppointmentsChart } from "@/components/dashboard/appointments-chart";
import {
  computeAppointmentsChart,
  computeDashboardKPI,
  computePopularServices,
  computeRevenueChart,
  computeTopDoctors,
} from "@/lib/analytics";
import { formatCurrency } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";

export default function ReportsPage() {
  const { payments, appointments, patients, doctors, services } = useClinicStore();

  const dashboardKPI = useMemo(
    () => computeDashboardKPI(payments, appointments, patients),
    [payments, appointments, patients]
  );
  const revenueChartData = useMemo(() => computeRevenueChart(payments), [payments]);
  const appointmentsChartData = useMemo(
    () => computeAppointmentsChart(appointments),
    [appointments]
  );
  const topDoctorsRevenue = useMemo(
    () => computeTopDoctors(doctors, appointments),
    [doctors, appointments]
  );
  const popularServices = useMemo(
    () => computePopularServices(services, appointments),
    [services, appointments]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Отчёты</h1>
        <p className="text-sm text-slate-500">Аналитика по вашим данным</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Выручка за месяц</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(dashboardKPI.revenueMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Приёмы сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dashboardKPI.appointmentsToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Новые пациенты</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dashboardKPI.newPatients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Средний чек</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(dashboardKPI.averageCheck)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Выручка</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueChartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Приёмы</CardTitle>
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
              <p className="text-sm text-slate-500">Нет данных</p>
            ) : (
              topDoctorsRevenue.map(({ doctor, revenue, appointments: count }) => (
                <div key={doctor.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{doctor.name}</p>
                    <p className="text-slate-500">{count} приёмов</p>
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
              <p className="text-sm text-slate-500">Нет данных</p>
            ) : (
              popularServices.map(({ service, count, revenue }) => (
                <div key={service.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-slate-500">{count} раз</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
