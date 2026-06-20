"use client";

import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { StaffSalariesSummary } from "@/lib/finance-utils";

interface FinanceSummaryStripProps {
  revenue: number;
  salaries: StaffSalariesSummary;
  expensesTotal: number;
  staffReimbursements: number;
  netAfterSalaries: number;
  netAfterAll: number;
  netLabel?: string;
  className?: string;
}

function MetricCard({
  label,
  value,
  highlight = false,
  negative = false,
  subtitle,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  negative?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 min-w-[140px]",
        highlight
          ? "border-teal-500/50 bg-[var(--nav-active-bg)]"
          : "border-[var(--border)] bg-[var(--card)]"
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          highlight ? "text-[var(--nav-active-fg)] opacity-90" : "text-[var(--muted)]"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          highlight
            ? "text-[var(--nav-active-fg)]"
            : negative
              ? "text-red-600"
              : "text-[var(--foreground)]"
        )}
      >
        {negative ? `−${formatCurrency(value)}` : formatCurrency(value)}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p> : null}
    </div>
  );
}

export function FinanceSummaryStrip({
  revenue,
  salaries,
  expensesTotal,
  staffReimbursements,
  netAfterSalaries,
  netAfterAll,
  netLabel = "Клинике после зарплат",
  className,
}: FinanceSummaryStripProps) {
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      <MetricCard label="Выручка за период" value={revenue} />
      <MetricCard label="Зарплаты врачам" value={salaries.doctorSalary} />
      <MetricCard label="Зарплаты ассистентам" value={salaries.assistantSalary} />
      <MetricCard label="Расходы клиники" value={expensesTotal} negative />
      <MetricCard
        label="К возмещению сотрудникам"
        value={staffReimbursements}
        negative
        subtitle="оплачено из личных средств"
      />
      <MetricCard label={netLabel} value={netAfterAll} highlight subtitle={`после зарплат: ${formatCurrency(netAfterSalaries)}`} />
    </div>
  );
}
