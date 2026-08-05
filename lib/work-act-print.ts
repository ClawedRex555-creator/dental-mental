import type { ClinicSettings, Patient, WorkAct } from "./types";
import { isTechnicalServiceCategory } from "./service-categories";
import {
  calcWorkActLine,
  formatActAmount,
  formatActShortDate,
  formatDocumentDiscount,
  getActDisplayNumber,
  getContractNumber,
  getPatientActName,
  getWorkActCustomerName,
  resolveWorkActTotals,
} from "./work-act-utils";

import { escapeHtml } from "./escape-html";
import { sanitizeHttpImageUrl } from "./safe-url";

export function printWorkAct(
  act: WorkAct,
  patient: Patient,
  clinic: ClinicSettings
) {
  // Пациентская печатная форма не должна показывать внутреннюю «техничку».
  const printableItems = act.items.filter(
    (item) => !isTechnicalServiceCategory(item.serviceCategory)
  );
  const printableAct: WorkAct =
    printableItems.length === act.items.length ? act : { ...act, items: printableItems };
  const totals = resolveWorkActTotals(printableAct);
  const actNo = getActDisplayNumber(act.actNumber, act.actDate);
  const docDiscountLabel = formatDocumentDiscount(
    act.discountType ?? "percent",
    act.discount ?? 0
  );
  const actDateShort = formatActShortDate(act.actDate);
  const contractNo = getContractNumber(patient.id);
  const contractDate = patient.createdAt
    ? formatActShortDate(patient.createdAt)
    : actDateShort;
  const patientName = getWorkActCustomerName(patient);
  const beneficiaryName = patient.isChild
    ? getPatientActName(patient.firstName, patient.lastName, patient.middleName)
    : undefined;
  const serviceCount = printableAct.items.length;
  const showToothColumn = printableAct.items.some((item) => item.toothNumber != null);

  const rows = printableAct.items
    .map((item, i) => {
      const line = calcWorkActLine(item);
      const discountLabel =
        line.discountPercent > 0 ? `${line.discountPercent}%` : "—";
      return `
    <tr>
      <td class="c-num">${i + 1}</td>
      <td class="c-name">${escapeHtml(item.serviceName)}</td>
      ${showToothColumn ? `<td class="c-tooth">${item.toothNumber ?? "—"}</td>` : ""}
      <td class="c-qty">${item.quantity}</td>
      <td class="c-money">${formatActAmount(item.price)}</td>
      <td class="c-money">${formatActAmount(line.sum)}</td>
      <td class="c-disc">${discountLabel}</td>
      <td class="c-money">${formatActAmount(line.totalAfterDiscount)}</td>
    </tr>`;
    })
    .join("");

  const safeLogo = sanitizeHttpImageUrl(clinic.logo);
  const logoBlock = safeLogo
    ? `<img src="${escapeHtml(safeLogo)}" alt="" class="logo-img"/>`
    : `<div class="logo-placeholder" aria-hidden="true"></div>`;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>Акт ${escapeHtml(actNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      margin: 16mm 14mm;
      line-height: 1.35;
    }
    .header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .logo-placeholder {
      width: 48px; height: 48px;
      border: 1px solid #ccc;
      background: #f8f8f8;
      flex-shrink: 0;
    }
    .logo-img { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
    .title-block { flex: 1; }
    .act-title { font-size: 13px; font-weight: normal; margin: 0 0 6px; }
    .parties { margin: 0; }
    .parties p { margin: 2px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
    }
    th {
      font-weight: normal;
      text-align: center;
      background: #fff;
    }
    .c-num { width: 28px; text-align: center; }
    .c-name { text-align: left; }
    .c-tooth { width: 40px; text-align: center; }
    .c-qty { width: 44px; text-align: center; }
    .c-money { width: 72px; text-align: right; white-space: nowrap; }
    .c-disc { width: 52px; text-align: center; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 0; }
    .totals {
      width: 280px;
      border: 1px solid #000;
      border-top: none;
      padding: 6px 8px;
      font-size: 11px;
    }
    .totals-row { display: flex; justify-content: space-between; margin: 2px 0; }
    .totals-row strong { font-weight: normal; }
    .summary { margin-top: 12px; font-size: 12px; }
    .legal {
      margin-top: 8px;
      font-size: 11px;
      max-width: 100%;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      gap: 24px;
      font-size: 11px;
    }
    .sign-col { flex: 1; }
    .sign-line { margin-top: 28px; border-bottom: 1px solid #000; min-height: 1px; }
    .sign-label { margin-top: 4px; }
    .mp { margin-top: 6px; font-size: 10px; }
    @media print {
      body { margin: 12mm 10mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoBlock}
    <div class="title-block">
      <p class="act-title">
        Акт № ${escapeHtml(actNo)} от ${actDateShort} по Договору № ${contractNo} от ${contractDate}
      </p>
      <div class="parties">
        <p><strong>Исполнитель:</strong> ${escapeHtml(clinic.name)}</p>
        <p><strong>Заказчик:</strong> ${escapeHtml(patientName)}</p>
        ${
          beneficiaryName
            ? `<p><strong>Пациент:</strong> ${escapeHtml(beneficiaryName)} (ребёнок)</p>`
            : ""
        }
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-num">№</th>
        <th class="c-name">Наименование товара, работ, услуг</th>
        ${showToothColumn ? `<th class="c-tooth">Зуб</th>` : ""}
        <th class="c-qty">Кол-во</th>
        <th class="c-money">Цена, руб.</th>
        <th class="c-money">Сумма</th>
        <th class="c-disc">Скидка</th>
        <th class="c-money">Сумма со скидкой</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="totals-row">
        <span>Итого:</span>
        <span>${formatActAmount(totals.afterRowDiscounts)} руб.</span>
      </div>
      ${
        totals.discountValue > 0
          ? `<div class="totals-row">
        <span>Скидка${docDiscountLabel ? ` (${escapeHtml(docDiscountLabel)})` : ""}:</span>
        <span>−${formatActAmount(totals.discountValue)} руб.</span>
      </div>`
          : ""
      }
      <div class="totals-row">
        <span>Итого с учетом скидки:</span>
        <span>${formatActAmount(totals.totalAmount)} руб.</span>
      </div>
      <div class="totals-row" style="margin-top:6px">
        <span>НДС не облагается</span>
        <span></span>
      </div>
    </div>
  </div>

  <p class="summary">
    Всего оказано услуг ${serviceCount}, на сумму ${formatActAmount(totals.totalAmount)} RUB
  </p>
  <p class="legal">
    Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему,
    качеству и срокам оказания услуг не имеет.
  </p>

  <div class="signatures">
    <div class="sign-col">
      <div>Исполнитель</div>
      <div class="sign-line"></div>
      <div class="sign-label">${escapeHtml(clinic.name)}</div>
      <div class="mp">М.П.</div>
    </div>
    <div class="sign-col">
      <div>Заказчик</div>
      <div class="sign-line"></div>
      <div class="sign-label">${escapeHtml(patientName)}</div>
    </div>
  </div>

  ${act.notes ? `<p style="margin-top:16px;font-size:10px;color:#444"><strong>Примечание:</strong> ${escapeHtml(act.notes)}</p>` : ""}

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Разрешите всплывающие окна для печати акта");
    return;
  }
  win.document.write(html);
  win.document.close();
}
