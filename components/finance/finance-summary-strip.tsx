"use client";

import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { StaffSalariesSummary } from "@/lib/finance-utils";

interface FinanceSummaryStripProps {
  revenue: number;
  salaries: StaffSalariesSummary;
  netAfterSalaries: number;
  netLabel?: string;
  className?: string;
}

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
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
          highlight ? "text-[var(--nav-active-fg)]" : "text-[var(--foreground)]"
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export function FinanceSummaryStrip({
  revenue,
  salaries,
  netAfterSalaries,
  netLabel = "Клинике после зарплат",
  className,
}: FinanceSummaryStripProps) {
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      <MetricCard label="Выручка за период" value={revenue} />
      <MetricCard label="Зарплаты врачам" value={salaries.doctorSalary} />
      <MetricCard label="Зарплаты ассистентам" value={salaries.assistantSalary} />
      <MetricCard label={netLabel} value={netAfterSalaries} highlight />
    </div>
  );
}
