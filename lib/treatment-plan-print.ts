import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { ClinicSettings, Doctor, Patient, TreatmentPlan } from "./types";
import { normalizePlanItemQuantity, planItemLineTotal } from "./treatment-plan-item-utils";
import { formatCurrency, getFullName } from "./utils";
import { TREATMENT_PLAN_STATUS_LABELS } from "./constants";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printTreatmentPlan(
  plan: TreatmentPlan,
  patient: Patient,
  doctor: Doctor | undefined,
  clinic: ClinicSettings
) {
  const patientName = getFullName(patient.firstName, patient.lastName, patient.middleName);
  const rows = plan.items
    .map(
      (item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(item.serviceName)}</td>
      <td>${item.toothNumber ?? "—"}</td>
      <td style="text-align:center">${normalizePlanItemQuantity(item.quantity)}</td>
      <td style="text-align:right">${formatCurrency(planItemLineTotal(item))}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(plan.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 20mm; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #444; margin-bottom: 16px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f1f5f9; }
    .total { font-size: 16px; font-weight: bold; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(plan.title)}</h1>
  <p class="meta">
    ${escapeHtml(clinic.name)}<br/>
    Пациент: ${escapeHtml(patientName)}<br/>
    Врач: ${escapeHtml(doctor?.name ?? "—")}<br/>
    Дата: ${format(new Date(plan.createdAt), "d MMMM yyyy", { locale: ru })}<br/>
    Статус: ${escapeHtml(TREATMENT_PLAN_STATUS_LABELS[plan.status])}
  </p>
  <table>
    <thead>
      <tr><th>№</th><th>Услуга</th><th>Зуб</th><th>Кол-во</th><th>Сумма</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p>Итого: ${formatCurrency(plan.totalAmount)}</p>
  <p class="total">К оплате: ${formatCurrency(plan.finalAmount)}</p>
  ${plan.comment ? `<p><strong>Комментарий:</strong> ${escapeHtml(plan.comment)}</p>` : ""}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
