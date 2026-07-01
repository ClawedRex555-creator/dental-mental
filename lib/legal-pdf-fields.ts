/** Справочник полей PDF-бланков (Word → PDF → автозаполнение при визите) */

export type LegalPdfFieldGroup = "patient" | "customer" | "clinic" | "doctor" | "date";

/** Word legacy form: закладка/тег поля — обычно не больше 20 символов */
export const WORD_FORM_FIELD_NAME_MAX_LEN = 20;

/** Короткие имена для полей, не влезающих в лимит Word */
const WORD_FIELD_SHORT_NAMES: Record<string, string> = {
  "patient.contractNumber": "patient_contract_no",
  "patient.representativeFullName": "patient_repr_fio",
  "patient.representativePassport": "patient_repr_pass",
  "patient.birthCertificate": "patient_birth_cert",
  "doctor.specialization": "doctor_specialty",
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
    "Согласия — всегда имя пациента"
  ),
  field("patient.birthDate", "patient", "Дата рождения", "15.03.2010"),
  field("patient.age", "patient", "Возраст", "15"),
  field("patient.phone", "patient", "Телефон", "+7 (999) 123-45-67"),
  field("patient.email", "patient", "Email", "patient@example.com"),
  field("patient.address", "patient", "Адрес", "г. Ростов-на-Дону, ул. …"),
  field("patient.passport", "patient", "Паспорт (серия и номер)", "6012 345678"),
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
    "Законный представитель",
    "Иванов Иван Иванович",
    "Если пациент — ребёнок"
  ),
  field(
    "patient.representativePassport",
    "patient",
    "Паспорт представителя",
    "6012 345678"
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
      "patient_phone",
      "patient_passport",
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
      "patient_repr_pass",
      "patient_birth_cert",
      "clinic_name",
      "date_today",
    ],
  },
];
