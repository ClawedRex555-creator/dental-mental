import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { ArrivalPrintDocument } from "@/lib/legal-categories";
import { GENDER_LABELS } from "@/lib/constants";
import { escapeHtml } from "@/lib/escape-html";
import { sanitizeHttpImageUrl } from "@/lib/safe-url";
import type { ClinicSettings, Doctor, Patient } from "@/lib/types";
import { formatDate, formatPhone, getAge, getFullName } from "@/lib/utils";
import { tokenKeyToWordFieldName } from "@/lib/legal-pdf-fields";
import { isDocxLegalSource, isPdfLegalSource } from "@/lib/resolve-legal-document-source";
import { getContractNumber, getPatientActName, getWorkActCustomerName, getWorkActCustomerPassport, getPatientOrRepresentativeFullName, getPatientOrRepresentativePassport, getPatientOrRepresentativeBirthDate, getLegalRepresentativeFullName, getLegalRepresentativePassport, getLegalRepresentativeBirthDate } from "@/lib/work-act-utils";

export interface ArrivalDocumentContext {
  patient: Patient;
  clinic: ClinicSettings;
  doctor?: Doctor;
  appointmentDate?: string;
  documentDate?: string;
}

function dash(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatPassport(patient: Patient): string {
  const series = patient.passportSeries?.trim();
  const number = patient.passportNumber?.trim();
  if (series && number) return `${series} ${number}`;
  return series || number || "—";
}

function formatBirthCertificate(patient: Patient): string {
  const series = patient.birthCertificateSeries?.trim();
  const number = patient.birthCertificateNumber?.trim();
  if (series && number) return `серия ${series} № ${number}`;
  if (number) return `№ ${number}`;
  return series || "—";
}

function formatClinicPhone(phone: string | undefined): string {
  const trimmed = phone?.trim();
  if (!trimmed) return "—";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) return formatPhone(trimmed);
  return trimmed;
}

/** Плейсхолдеры для текста в юр. отделе (поле «Примечание») и встроенных форм */
export function buildArrivalDocumentTokens(
  ctx: ArrivalDocumentContext
): Record<string, string> {
  const { patient, clinic, doctor } = ctx;
  const today = ctx.documentDate ? new Date(ctx.documentDate) : new Date();
  const contractNumber = getContractNumber(patient.id);
  const fullName = getFullName(patient.firstName, patient.lastName, patient.middleName);
  const customerName = getWorkActCustomerName(patient);
  const customerPassport = getWorkActCustomerPassport(patient);
  const patientOrRepresentativeName = getPatientOrRepresentativeFullName(patient);
  const patientOrRepresentativePassport = getPatientOrRepresentativePassport(patient);
  const patientOrRepresentativeBirthDate = getPatientOrRepresentativeBirthDate(patient);
  const legalRepresentativeFullName = getLegalRepresentativeFullName(patient);
  const legalRepresentativePassport = getLegalRepresentativePassport(patient);
  const legalRepresentativeBirthDate = getLegalRepresentativeBirthDate(patient);
  const actName = getPatientActName(
    patient.firstName,
    patient.lastName,
    patient.middleName
  );
  const clinicPhone = formatClinicPhone(clinic.phone);
  const clinicWorkHours = dash(clinic.workHours);

  const tokens: Record<string, string> = {
    "customer.fullName": customerName,
    "customer.passport": customerPassport,
    "patientOrRepresentative.fullName": patientOrRepresentativeName,
    "patientOrRepresentative.passport": patientOrRepresentativePassport,
    "patientOrRepresentative.birthDate": patientOrRepresentativeBirthDate,
    "patient.fullName": fullName,
    "patient.beneficiaryFullName": fullName,
    "patient.actName": actName,
    "patient.firstName": dash(patient.firstName),
    "patient.lastName": dash(patient.lastName),
    "patient.middleName": dash(patient.middleName),
    "patient.phone": formatPhone(patient.phone),
    "patient.email": dash(patient.email),
    "patient.birthDate": formatDate(patient.birthDate),
    "patient.age": String(getAge(patient.birthDate)),
    "patient.gender":
      patient.gender in GENDER_LABELS
        ? GENDER_LABELS[patient.gender as keyof typeof GENDER_LABELS]
        : patient.gender,
    "patient.address": dash(patient.address),
    "patient.snils": dash(patient.snils),
    "patient.passport": formatPassport(patient),
    "patient.passportSeries": dash(patient.passportSeries),
    "patient.passportNumber": dash(patient.passportNumber),
    "patient.contractNumber": contractNumber,
    "patient.representativeFullName": legalRepresentativeFullName,
    "patient.representativeBirthDate": legalRepresentativeBirthDate,
    "patient.representativePassport": legalRepresentativePassport,
    "patient.birthCertificate": formatBirthCertificate(patient),
    "patient.isChild": patient.isChild ? "да" : "нет",
    "clinic.name": dash(clinic.name),
    "clinic.address": dash(clinic.address),
    "clinic.phone": clinicPhone,
    "clinic.email": dash(clinic.email),
    "clinic.inn": dash(clinic.inn),
    "clinic.workHours": clinicWorkHours,
    "doctor.name": dash(doctor?.name),
    "doctor.specialization": dash(doctor?.specialization),
    "doctor.phone": formatClinicPhone(doctor?.phone),
    "appointment.date": ctx.appointmentDate
      ? formatDate(ctx.appointmentDate)
      : formatDate(today),
    "date.today": format(today, "dd.MM.yyyy"),
    "date.todayLong": format(today, "d MMMM yyyy 'г.'", { locale: ru }),
    "пациент.фио": fullName,
    "заказчик.фио": customerName,
    "пациент.телефон": formatPhone(patient.phone),
    "пациент.адрес": dash(patient.address),
    "пациент.датаРождения": formatDate(patient.birthDate),
    "пациент.паспорт": formatPassport(patient),
    "пациент.снилс": dash(patient.snils),
    "пациент.договор": contractNumber,
    "пациент.представитель": dash(patient.representativeFullName),
    "клиника.название": dash(clinic.name),
    "клиника.адрес": dash(clinic.address),
    "клиника.инн": dash(clinic.inn),
    "клиника.телефон": clinicPhone,
    "клиника.email": dash(clinic.email),
    "клиника.режим": clinicWorkHours,
    "дата.сегодня": format(today, "dd.MM.yyyy"),
    "врач.фио": dash(doctor?.name),
    "врач.специализация": dash(doctor?.specialization),
  };

  for (const [key, value] of Object.entries({ ...tokens })) {
    if (key.includes(".")) {
      tokens[tokenKeyToWordFieldName(key)] = value;
    }
  }

  return tokens;
}

export function fillDocumentTemplate(
  template: string,
  ctx: ArrivalDocumentContext
): string {
  const tokens = buildArrivalDocumentTokens(ctx);
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key: string) => {
    const normalized = key.trim();
    if (Object.prototype.hasOwnProperty.call(tokens, normalized)) {
      return tokens[normalized];
    }
    return match;
  });
}

function patientIdentityLine(ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  if (ctx.patient.isChild) {
    const rep = t["patient.representativeFullName"].trim()
      ? `, законный представитель: ${t["patient.representativeFullName"]}`
      : "";
    return `${t["patient.fullName"]}, дата рождения ${t["patient.birthDate"]}, свидетельство о рождении ${t["patient.birthCertificate"]}${rep}`;
  }
  return `${t["patient.fullName"]}, дата рождения ${t["patient.birthDate"]}, паспорт ${t["patient.passport"]}`;
}

function builtinDocumentBody(doc: ArrivalPrintDocument, ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  const who = patientIdentityLine(ctx);

  if (doc.id === "builtin-egisz-refusal" || doc.kind === "egisz_refusal") {
    return `Я, ${who}, контактный телефон ${t["patient.phone"]}, уведомлён(а) о праве на отказ от передачи персональных данных и сведений, составляющих врачебную тайну, в Единую государственную информационную систему в сфере здравоохранения (ЕГИСЗ) в порядке, установленном законодательством Российской Федерации (в т.ч. 140-ФЗ, 323-ФЗ).

Настоящим выражаю отказ на передачу моих персональных данных и медицинских сведений в ЕГИСЗ через информационную систему ${t["clinic.name"]}.`;
  }

  if (doc.kind === "consent") {
    return `Я, ${who}, зарегистрирован(а) по адресу: ${t["patient.address"]}, СНИЛС ${t["patient.snils"]}, даю информированное добровольное согласие на медицинское вмешательство и обработку персональных данных в медицинской организации «${t["clinic.name"]}» (${t["clinic.address"]}, ИНН ${t["clinic.inn"]}, тел. ${t["clinic.phone"]}).

Мне разъяснены цели, методы, возможные риски и последствия оказания медицинских услуг.${t["doctor.name"] !== "—" ? ` Лечащий врач: ${t["doctor.name"]}${t["doctor.specialization"] !== "—" ? ` (${t["doctor.specialization"]})` : ""}.` : ""}`;
  }

  return `Договор на оказание платных медицинских услуг № ${t["patient.contractNumber"]} от ${t["date.today"]}

Заказчик: ${who}, адрес: ${t["patient.address"]}, телефон ${t["patient.phone"]}.

Исполнитель: ${t["clinic.name"]}, юридический адрес: ${t["clinic.address"]}, ИНН ${t["clinic.inn"]}, тел. ${t["clinic.phone"]}, e-mail ${t["clinic.email"]}. Режим работы: ${t["clinic.workHours"]}.

Стороны заключили настоящий договор о нижеследующем: Исполнитель обязуется оказать Заказчику платные медицинские услуги в объёме и на условиях, согласованных сторонами, а Заказчик обязуется оплатить оказанные услуги.`;
}

function documentBodyHtml(doc: ArrivalPrintDocument, ctx: ArrivalDocumentContext): string {
  const raw = doc.notes?.trim()
    ? fillDocumentTemplate(doc.notes, ctx)
    : builtinDocumentBody(doc, ctx);
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return paragraphs;
}

export function renderClinicLetterheadHtml(ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  const safeLogo = sanitizeHttpImageUrl(ctx.clinic.logo);
  const logoBlock = safeLogo
    ? `<img src="${escapeHtml(safeLogo)}" alt="" class="logo-img"/>`
    : `<div class="logo-placeholder" aria-hidden="true"></div>`;

  return `
    <header class="clinic-letterhead">
      ${logoBlock}
      <div class="clinic-letterhead-text">
        <p class="clinic-name">${escapeHtml(t["clinic.name"])}</p>
        <p>${escapeHtml(t["clinic.address"])}</p>
        <p>ИНН ${escapeHtml(t["clinic.inn"])} · тел. ${escapeHtml(t["clinic.phone"])} · ${escapeHtml(t["clinic.email"])}</p>
        <p>Режим работы: ${escapeHtml(t["clinic.workHours"])}</p>
      </div>
    </header>`;
}

export function renderClinicSummaryHtml(ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  const doctorLine =
    t["doctor.name"] !== "—"
      ? `<p><strong>Врач приёма:</strong> ${escapeHtml(t["doctor.name"])}${t["doctor.specialization"] !== "—" ? ` (${escapeHtml(t["doctor.specialization"])})` : ""}</p>`
      : "";

  return `
    <section class="summary-block clinic-summary">
      <h2>Данные клиники</h2>
      <p><strong>Название:</strong> ${escapeHtml(t["clinic.name"])}</p>
      <p><strong>Адрес:</strong> ${escapeHtml(t["clinic.address"])}</p>
      <p><strong>ИНН:</strong> ${escapeHtml(t["clinic.inn"])} · <strong>Тел.:</strong> ${escapeHtml(t["clinic.phone"])} · <strong>E-mail:</strong> ${escapeHtml(t["clinic.email"])}</p>
      <p><strong>Режим работы:</strong> ${escapeHtml(t["clinic.workHours"])}</p>
      ${doctorLine}
    </section>`;
}

export function renderPatientSummaryHtml(ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  const childBlock =
    ctx.patient.isChild && t["patient.representativeFullName"].trim()
      ? `<p><strong>Законный представитель:</strong> ${escapeHtml(t["patient.representativeFullName"])}</p>`
      : "";

  return `
    <section class="summary-block patient-summary">
      <h2>Данные пациента</h2>
      <p><strong>ФИО:</strong> ${escapeHtml(t["patient.fullName"])}</p>
      <p><strong>Дата рождения:</strong> ${escapeHtml(t["patient.birthDate"])} (${escapeHtml(t["patient.age"])} лет)</p>
      <p><strong>Телефон:</strong> ${escapeHtml(t["patient.phone"])}</p>
      <p><strong>Адрес:</strong> ${escapeHtml(t["patient.address"])}</p>
      <p><strong>Паспорт:</strong> ${escapeHtml(t["patient.passport"])} · <strong>СНИЛС:</strong> ${escapeHtml(t["patient.snils"])}</p>
      <p><strong>Договор №:</strong> ${escapeHtml(t["patient.contractNumber"])} · <strong>Дата визита:</strong> ${escapeHtml(t["appointment.date"])}</p>
      ${childBlock}
    </section>`;
}

export function renderPartiesSummaryHtml(ctx: ArrivalDocumentContext): string {
  return `
    <div class="parties-grid">
      ${renderClinicSummaryHtml(ctx)}
      ${renderPatientSummaryHtml(ctx)}
    </div>`;
}

function renderSignatureBlockHtml(ctx: ArrivalDocumentContext): string {
  const t = buildArrivalDocumentTokens(ctx);
  return `
    <div class="signatures">
      <div class="sign-col">
        <p>Исполнитель (${escapeHtml(t["clinic.name"])})</p>
        <div class="sign-line"></div>
        <p class="sign-caption">подпись / М.П.</p>
      </div>
      <div class="sign-col">
        <p>Заказчик (${escapeHtml(t["customer.fullName"])})</p>
        <div class="sign-line"></div>
        <p class="sign-caption">подпись · дата _______</p>
      </div>
    </div>`;
}

export function renderArrivalDocumentSectionHtml(
  doc: ArrivalPrintDocument,
  ctx: ArrivalDocumentContext
): string {
  return `
    <section class="doc-section page-break">
      <h2>${escapeHtml(doc.name)}</h2>
      ${documentBodyHtml(doc, ctx)}
      ${renderSignatureBlockHtml(ctx)}
    </section>`;
}

export function isPdfArrivalDocument(doc: ArrivalPrintDocument): boolean {
  return isPdfLegalSource(doc);
}

export function isDocxArrivalDocument(doc: ArrivalPrintDocument): boolean {
  return isDocxLegalSource(doc);
}

export function buildArrivalDocumentsPrintHtml(options: {
  documents: ArrivalPrintDocument[];
  ctx: ArrivalDocumentContext;
  sendToEgisz: "yes" | "no";
}): string {
  const egiszLine =
    options.sendToEgisz === "yes"
      ? "Данные для передачи в ЕГИСЗ: да"
      : "Отказ от передачи данных в ЕГИСЗ — печать формы";

  const sections = options.documents
    .filter((doc) => !isPdfArrivalDocument(doc))
    .map((doc) => renderArrivalDocumentSectionHtml(doc, options.ctx))
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>Документы — ${escapeHtml(buildArrivalDocumentTokens(options.ctx)["clinic.name"])}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111; margin: 16mm 14mm; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 8px; }
    h2 { font-size: 13px; margin: 0 0 8px; }
    p { margin: 0 0 10px; }
    .meta { text-align: center; color: #444; margin-bottom: 16px; font-size: 11px; }
    .clinic-letterhead { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
    .logo-placeholder { width: 48px; height: 48px; border: 1px solid #ccc; background: #f8f8f8; flex-shrink: 0; }
    .logo-img { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
    .clinic-letterhead-text { flex: 1; }
    .clinic-name { font-size: 15px; font-weight: bold; margin: 0 0 4px; }
    .clinic-letterhead-text p { margin: 0 0 2px; font-size: 11px; color: #334155; }
    .parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0 16px; }
    .summary-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .summary-block p { margin: 0 0 4px; font-size: 11px; }
    .doc-section { margin-top: 24px; }
    .page-break { break-before: page; page-break-before: always; }
    .doc-section:first-of-type { break-before: auto; page-break-before: auto; }
    .file-note { color: #0f766e; font-size: 11px; }
    .signatures { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; }
    .sign-col { width: 46%; }
    .sign-col p { margin: 0 0 4px; font-size: 11px; }
    .sign-line { border-top: 1px solid #333; margin-top: 36px; }
    .sign-caption { margin-top: 4px; font-size: 10px; color: #64748b; }
    @media print {
      .page-break { break-before: page; }
      .parties-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .parties-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${renderClinicLetterheadHtml(options.ctx)}
  <h1>Комплект документов</h1>
  <p class="meta">${egiszLine} · ${escapeHtml(buildArrivalDocumentTokens(options.ctx)["date.todayLong"])}</p>
  ${renderPartiesSummaryHtml(options.ctx)}
  ${sections}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
