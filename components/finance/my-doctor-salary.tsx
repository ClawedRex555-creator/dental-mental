"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  buildDoctorSalarySummary,
  getPaidServiceActsForDoctor,
  resolveDoctorStaffId,
} from "@/lib/doctor-salary";
import { getSalaryPeriodRange, type SalaryPeriod } from "@/lib/salary-period";
import { UI } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MyDoctorSalary() {
  const { currentUser, doctors, workActs, payments, patients, services } = useClinicStore();
  const [period, setPeriod] = useState<SalaryPeriod>("day");
  const [customFrom, setCustomFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const doctorId = useMemo(
    () => resolveDoctorStaffId(currentUser.staffId, currentUser.email, doctors),
    [currentUser.staffId, currentUser.email, doctors]
  );

  const doctor = useMemo(
    () => doctors.find((d) => d.id === doctorId && d.role === "doctor"),
    [doctors, doctorId]
  );

  const { from, to } = useMemo(
    () => getSalaryPeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const summary = useMemo(() => {
    if (!doctor) return null;
    const acts = getPaidServiceActsForDoctor(workActs, doctor.id, from, to, payments);
    return buildDoctorSalarySummary(doctor, acts, patients, services);
  }, [doctor, workActs, payments, patients, services, from, to]);

  if (!doctorId || !doctor) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--foreground)]">Профиль врача не привязан</p>
          <p className="mt-2">
            Обратитесь к администратору: учётная запись должна быть связана с карточкой врача в
            разделе «Сотрудники» (тот же email).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Моя зарплата</h1>
        <p className="text-sm text-[var(--muted)]">
          Начисление по полностью оплаченным актам (дата закрытия акта, после вычета технички) · комиссия{" "}
          {doctor.commissionPercent}%
          {doctor.implantFee != null && doctor.implantFee > 0
            ? doctor.implantFeeType === "rubles"
              ? ` · имплантация ${doctor.implantFee} ₽/ед.`
              : ` · имплантация ${doctor.implantFee}%`
            : ""}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="flex flex-wrap gap-2">
            {(["day", "week", "month", "custom"] as SalaryPeriod[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
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
              <div className="space-y-1">
                <Label className="text-xs">С</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">По</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[var(--muted)]">Оплаченных актов</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{summary.actsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[var(--muted)]">
                  Оплачено пациентами
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(summary.patientsTotal)}</p>
              </CardContent>
            </Card>
            <Card className="border-teal-200 bg-teal-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-teal-800">Вам начислено</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold salary-accent">
                  {formatCurrency(summary.doctorAmount)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {summary.doctorPercent}% от оплаченных услуг
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Детализация по актам</CardTitle>
              <p className="text-sm text-[var(--muted)]">
                Учитываются только акты со статусом «оплачено»
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                    <th className="px-4 py-3">{UI.date}</th>
                    <th className="px-4 py-3">{UI.patient}</th>
                    <th className="px-4 py-3">Акт</th>
                    <th className="px-4 py-3 text-right">Сумма акта</th>
                    <th className="px-4 py-3 text-right">Ваша доля</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                        За выбранный период оплаченных актов нет
                      </td>
                    </tr>
                  ) : (
                    summary.lines.map((line) => (
                      <tr key={line.act.id} className="border-b border-[var(--border)]/60">
                        <td className="px-4 py-3">{formatDate(line.act.actDate)}</td>
                        <td className="px-4 py-3">{line.patientName}</td>
                        <td className="px-4 py-3">{line.act.actNumber}</td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(line.total)}
                        </td>
                        <td className="px-4 py-3 text-right salary-accent">
                          {formatCurrency(line.doctorAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
