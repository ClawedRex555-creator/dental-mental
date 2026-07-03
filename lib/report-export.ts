import type { DoctorRevenueStat, PopularServiceStat } from "@/lib/analytics";

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildAnalyticsCsv(options: {
  periodLabel: string;
  revenue: number;
  appointments: number;
  newPatients: number;
  averageCheck: number;
  expensesTotal: number;
  salariesTotal: number;
  netAfterAll: number;
  topDoctors: DoctorRevenueStat[];
  popularServices: PopularServiceStat[];
}): string {
  const lines = [
    ["Период", options.periodLabel],
    ["Выручка", options.revenue],
    ["Приёмы", options.appointments],
    ["Новые пациенты", options.newPatients],
    ["Средний чек", options.averageCheck],
    ["Расходы", options.expensesTotal],
    ["Зарплаты", options.salariesTotal],
    ["Итого клинике", options.netAfterAll],
    [],
    ["Топ врачей"],
    ["Врач", "Выручка", "Приёмы", "Акты"],
    ...options.topDoctors.map((row) => [
      row.doctor.name,
      row.revenue,
      row.appointments,
      row.acts,
    ]),
    [],
    ["Популярные услуги"],
    ["Услуга", "Количество", "Выручка"],
    ...options.popularServices.map((row) => [row.name, row.count, row.revenue]),
  ];

  return lines
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
