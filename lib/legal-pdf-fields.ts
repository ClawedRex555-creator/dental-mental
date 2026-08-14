/** Справочник полей PDF-бланков (Word → PDF → автозаполнение при визите) */

export type LegalPdfFieldGroup = "patient" | "customer" | "clinic" | "doctor" | "date";

/** Word legacy form: закладка/тег поля — обычно не больше 20 символов */
export const WORD_FORM_FIELD_NAME_MAX_LEN = 20;

/** Короткие имена для полей, не влезающих в лимит Word */
const WORD_FIELD_SHORT_NAMES: Record<string, string> = {
  "patient.contractNumber": "patient_contract_no",
  "patient.representativeFullName": "patient_repr_fio",
  "patient.representativeBirthDate": "patient_repr_birth",
  "patient.representativePassport": "patient_repr_pass",
  "patient.birthCertificate": "patient_birth_cert",
  "patient.passportIssuedBy": "passport_issued_by",
  "patient.passportIssuedAt": "passport_issued_at",
  "patient.passportIssuerCode": "passport_issuer_code",
  "doctor.specialization": "doctor_specialty",
  "patientOrRepresentative.fullName": "patient_or_repr_fio",
  "patientOrRepresentative.passport": "patient_or_repr_pass",
  "patientOrRepresentative.birthDate": "patient_or_repr_birth",
};

/** Имя поля для Word (латиница, подчёркивания, ≤20 символов где нужно) */
export function tokenKeyToWordFieldName(tokenKey: string): string {
  const short = WORD_FIELD_SHORT_NAMES[tokenKey];
  if (short) return short;
  return tokenKey
    .replace(/\./g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

export interface LegalPdfFieldDef {
  /** Внутренний ключ токена */
  tokenKey: string;
  /** Имя в Word / PDF — копируйте в свойства поля */
  wordName: string;
  group: LegalPdfFieldGroup;
  label: string;
  example: string;
  hint?: string;
}

function field(
  tokenKey: string,
  group: LegalPdfFieldGroup,
  label: string,
  example: string,
  hint?: string
): LegalPdfFieldDef {
  return {
    tokenKey,
    wordName: tokenKeyToWordFieldName(tokenKey),
    group,
    label,
    example,
    hint,
  };
}

export const LEGAL_PDF_FIELD_CATALOG: LegalPdfFieldDef[] = [
  field(
    "customer.fullName",
    "customer",
    "Заказчик (ФИО для подписи)",
    "Иванов Иван Иванович",
    "Договор — для ребёнка подставится представитель"
  ),
  field(
    "customer.passport",
    "customer",
    "Паспорт заказчика",
    "6012 345678",
    "Для ребёнка — паспорт представителя, иначе — пациента"
  ),
  field(
    "patient.fullName",
    "patient",
    "Пациент (ФИО)",
    "Петрова Мария Сергеевна",
    "Всегда имя пациента (у ребёнка — ребёнок, не представитель)"
  ),
  field(
    "patientOrRepresentative.fullName",
    "patient",
    "Сторона договора (пациент или представитель)",
    "Иванов Иван Иванович",
    "Основная строка договора: взрослый → пациент, ребёнок → представитель. Не для блока «подпись представителя»"
  ),
  field(
    "patientOrRepresentative.passport",
    "patient",
    "Пациент или представитель (паспорт)",
    "6012 345678",
    "Ребёнок → паспорт представителя, взрослый → паспорт пациента"
  ),
  field(
    "patientOrRepresentative.birthDate",
    "patient",
    "Пациент или представитель (дата рождения)",
    "15.03.1985",
    "Ребёнок → д.р. представителя, взрослый → д.р. пациента"
  ),
  field("patient.birthDate", "patient", "Дата рождения", "15.03.2010"),
  field("patient.age", "patient", "Возраст", "15"),
  field("patient.phone", "patient", "Телефон", "+7 (999) 123-45-67"),
  field("patient.email", "patient", "Email", "patient@example.com"),
  field("patient.address", "patient", "Адрес", "г. Ростов-на-Дону, ул. …"),
  field("patient.passport", "patient", "Паспорт (серия и номер)", "6012 345678"),
  field(
    "patient.passportIssuedBy",
    "patient",
    "Паспорт — кем выдан",
    "ОВД … района",
    "Из карточки пациента. В Word: {passport_issued_by}"
  ),
  field(
    "patient.passportIssuedAt",
    "patient",
    "Паспорт — дата выдачи",
    "18.02.2015",
    "Из карточки пациента. В Word: {passport_issued_at}"
  ),
  field(
    "patient.passportIssuerCode",
    "patient",
    "Паспорт — код подразделения",
    "770-001",
    "Из карточки пациента (XXX-XXX). В Word: {passport_issuer_code}"
  ),
  field("patient.snils", "patient", "СНИЛС", "123-456-789 00"),
  field(
    "patient.contractNumber",
    "patient",
    "Номер договора",
    "1234-5678-9012-3456",
    "Генерируется из карточки пациента"
  ),
  field(
    "patient.representativeFullName",
    "patient",
    "Подпись законного представителя (ФИО)",
    "Иванов Иван Иванович",
    "Строка «в случае подписания законным представителем»: только для ребёнка, у взрослого пусто"
  ),
  field(
    "patient.representativeBirthDate",
    "patient",
    "Дата рождения представителя (подпись)",
    "15.03.1985",
    "Только для ребёнка; у взрослого пусто"
  ),
  field(
    "patient.representativePassport",
    "patient",
    "Паспорт представителя (подпись)",
    "6012 345678",
    "Только для ребёнка; у взрослого пусто"
  ),
  field(
    "patient.birthCertificate",
    "patient",
    "Свидетельство о рождении",
    "серия IV-АА № 123456"
  ),
  field("clinic.name", "clinic", "Название клиники (исполнитель)", "Стоматология «…»"),
  field("clinic.inn", "clinic", "ИНН клиники", "6168123456"),
  field("clinic.address", "clinic", "Адрес клиники", "г. …, ул. …"),
  field("clinic.phone", "clinic", "Телефон клиники", "+7 (863) …"),
  field("clinic.email", "clinic", "Email клиники", "info@clinic.ru"),
  field("clinic.workHours", "clinic", "Режим работы", "пн–пт 9:00–20:00"),
  field("doctor.name", "doctor", "ФИО врача", "Сидоров А.А."),
  field("doctor.specialization", "doctor", "Специализация врача", "Стоматолог-терапевт"),
  field("appointment.date", "date", "Дата приёма", "26.06.2026"),
  field("date.today", "date", "Сегодняшняя дата", "26.06.2026", "Дата подписания"),
];

export const LEGAL_PDF_FIELD_HINTS = LEGAL_PDF_FIELD_CATALOG.map((f) => f.wordName);

export const LEGAL_PDF_FIELD_GROUP_LABELS: Record<LegalPdfFieldGroup, string> = {
  customer: "Заказчик",
  patient: "Пациент",
  clinic: "Клиника",
  doctor: "Врач",
  date: "Даты",
};

/** Типовые наборы полей для частых бланков (имена для Word) */
export const LEGAL_PDF_TEMPLATE_PRESETS: { title: string; fields: string[] }[] = [
  {
    title: "Договор оказания услуг",
    fields: [
      "customer_full_name",
      "customer_passport",
      "patient_full_name",
      "patient_birth_date",
      "patient_or_repr_fio",
      "patient_or_repr_pass",
      "patient_or_repr_birth",
      "patient_repr_fio",
      "patient_repr_pass",
      "patient_repr_birth",
      "patient_phone",
      "patient_passport",
      "passport_issued_by",
      "passport_issued_at",
      "passport_issuer_code",
      "patient_contract_no",
      "clinic_name",
      "clinic_inn",
      "clinic_address",
      "date_today",
    ],
  },
  {
    title: "Информированное согласие",
    fields: [
      "patient_full_name",
      "patient_birth_date",
      "patient_phone",
      "clinic_name",
      "doctor_name",
      "appointment_date",
      "date_today",
    ],
  },
  {
    title: "Согласие / отказ ЕГИСЗ (ребёнок)",
    fields: [
      "patient_full_name",
      "patient_birth_date",
      "patient_repr_fio",
      "patient_repr_birth",
      "patient_repr_pass",
      "patient_birth_cert",
      "clinic_name",
      "date_today",
    ],
  },
];
