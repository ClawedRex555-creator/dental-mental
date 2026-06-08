import type { ClinicSettings, Patient, PatientPrepayment } from "./types";
import { formatCurrency, getFullName } from "./utils";
import { formatDocumentDiscount, getContractNumber, formatActShortDate } from "./work-act-utils";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Печать документа о внесении аванса (предоплаты) за планируемые мед. услуги */
export function printPrepaymentAct(
  prepayment: PatientPrepayment,
  patient: Patient,
  clinic: ClinicSettings
) {
  const patientName = getFullName(
    patient.firstName,
    patient.lastName,
    patient.middleName
  );
  const actNo = prepayment.actNumber ?? prepayment.id;
  const actDate = formatActShortDate(prepayment.date);
  const contractNo = getContractNumber(patient.id);
  const finalAmount = prepayment.finalAmount ?? prepayment.totalAmount;
  const discountValue = Math.max(0, prepayment.totalAmount - finalAmount);
  const discountLabel = formatDocumentDiscount(
    prepayment.discountType ?? "percent",
    prepayment.discount ?? 0
  );

  const rows = prepayment.items
    .map(
      (item, i) => `
    <tr>
      <td class="c-num">${i + 1}</td>
      <td class="c-name">${escapeHtml(item.serviceName)}</td>
      <td class="c-money">${formatCurrency(item.price)}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>Аванс ${escapeHtml(actNo)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 16mm 14mm; color: #000; line-height: 1.4; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 12px; }
    .meta { margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #333; padding: 6px 8px; }
    th { background: #f0f0f0; text-align: left; }
    .c-num { width: 32px; text-align: center; }
    .c-money { text-align: right; white-space: nowrap; }
    .totals { margin-top: 12px; }
    .totals p { margin: 4px 0; }
    .legal { margin-top: 16px; font-size: 10px; color: #444; }
    .sign { margin-top: 28px; display: flex; justify-content: space-between; }
    .sign div { width: 45%; border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Документ о внесении предоплаты (аванса)<br/>за планируемые медицинские услуги</h1>
  <div class="meta">
    <p><strong>${escapeHtml(clinic.name)}</strong></p>
    <p>Адрес: ${escapeHtml(clinic.address || "—")} · ИНН: ${escapeHtml(clinic.inn || "—")}</p>
    <p>№ документа: <strong>${escapeHtml(actNo)}</strong> от ${escapeHtml(actDate)}</p>
    <p>Пациент: <strong>${escapeHtml(patientName)}</strong></p>
    <p>Договор оказания платных мед. услуг № ${escapeHtml(contractNo)}</p>
  </div>
  <p>Перечень планируемых услуг и ориентировочная стоимость:</p>
  <table>
    <thead>
      <tr>
        <th class="c-num">№</th>
        <th>Наименование услуги</th>
        <th class="c-money">Стоимость, ₽</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <p><strong>Сумма услуг:</strong> ${formatCurrency(prepayment.totalAmount)}</p>
    ${
      discountValue > 0
        ? `<p><strong>Скидка${discountLabel ? ` (${discountLabel})` : ""}:</strong> −${formatCurrency(discountValue)}</p>
    <p><strong>К оплате по плану:</strong> ${formatCurrency(finalAmount)}</p>`
        : ""
    }
    <p><strong>Внесено авансом:</strong> ${formatCurrency(prepayment.paidAmount)}</p>
    <p><strong>Остаток к оплате:</strong> ${formatCurrency(prepayment.remainingAmount)}</p>
  </div>
  <div class="legal">
    <p>
      Настоящий документ подтверждает внесение аванса (предоплаты) в счёт будущего оказания
      медицинских услуг, указанных выше. Сумма аванса засчитывается при оказании услуг.
      Остаток подлежит оплате пациентом до/после оказания услуг в соответствии с договором.
    </p>
    <p>
      Основание: ст. 410, 421, 779, 781 ГК РФ; Правила предоставления платных медицинских услуг
      (Постановление Правительства РФ № 1006); при расчёте наличными — 54-ФЗ (кассовый чек).
    </p>
  </div>
  <div class="sign">
    <div>Подпись пациента / представителя</div>
    <div>Подпись уполномоченного лица клиники</div>
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
