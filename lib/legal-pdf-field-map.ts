/** Сопоставление имён полей PDF (AcroForm) с токенами данных пациента/клиники */
export const PDF_FIELD_TOKEN_ALIASES: Record<string, string[]> = {
  "patient.fullName": [
    "patient.fullname",
    "patientfullname",
    "patient_full_name",
    "patientfio",
    "patient_fio",
    "fio",
    "фио",
    "пациентфио",
    "fullname",
    "full_name",
    "заказчик",
    "заказчикфио",
  ],
  "patient.firstName": ["patientfirstname", "firstname", "имя"],
  "patient.lastName": ["patientlastname", "lastname", "фамилия"],
  "patient.middleName": ["patientmiddlename", "middlename", "отчество"],
  "patient.birthDate": [
    "patientbirthdate",
    "birthdate",
    "датарождения",
    "patient_birth",
    "др",
  ],
  "patient.phone": [
    "patientphone",
    "phone",
    "телефон",
    "patienttel",
    "мобильный",
    "patient_phone",
  ],
  "patient.email": ["patientemail", "email", "почта"],
  "patient.address": ["patientaddress", "address", "адрес", "адреспроживания"],
  "patient.passport": ["patientpassport", "passport", "паспорт", "документ"],
  "patient.passportSeries": ["passportseries", "паспортсерия", "серия"],
  "patient.passportNumber": ["passportnumber", "паспортномер", "номерпаспорта"],
  "patient.snils": ["patientsnils", "snils", "снилс"],
  "patient.contractNumber": [
    "contractnumber",
    "contract",
    "договор",
    "номердоговора",
    "patientcontract",
  ],
  "patient.representativeFullName": [
    "representative",
    "представитель",
    "законныйпредставитель",
    "representativefullname",
  ],
  "patient.representativePassport": ["representativepassport", "паспортпредставителя"],
  "patient.birthCertificate": ["birthcertificate", "свидетельство"],
  "clinic.name": ["clinicname", "clinic_name", "клиника", "клиниканазвание", "исполнитель"],
  "clinic.address": ["clinicaddress", "clinic_address", "адресклиники", "юрадрес"],
  "clinic.phone": ["clinicphone", "clinic_phone", "телефонклиники"],
  "clinic.email": ["clinicemail", "clinic_email"],
  "clinic.inn": ["clinicinn", "inn", "инн"],
  "clinic.workHours": ["clinicworkhours", "workhours", "режимработы"],
  "doctor.name": ["doctorname", "doctor", "врач", "врачфио", "doctor_fio"],
  "doctor.specialization": ["doctorspecialization", "specialization", "специальность", "должность"],
  "appointment.date": ["appointmentdate", "visitdate", "датавизита", "датаприема"],
  "date.today": ["date", "today", "дата", "датаподписания", "datetoday"],
};

export function normalizePdfFieldName(name: string): string {
  return name
    .trim()
    .replace(/^\{\{|\}\}$/g, "")
    .toLowerCase()
    .replace(/[\s._\-–—/\\]+/g, "");
}

/** Найти значение токена по имени поля в PDF */
export function resolveTokenForPdfField(
  fieldName: string,
  tokens: Record<string, string>
): string | null {
  const raw = fieldName.trim();
  if (tokens[raw]) return tokens[raw];

  const normalized = normalizePdfFieldName(raw);
  if (!normalized) return null;

  for (const [tokenKey, value] of Object.entries(tokens)) {
    if (normalizePdfFieldName(tokenKey) === normalized) return value;
  }

  for (const [tokenKey, aliases] of Object.entries(PDF_FIELD_TOKEN_ALIASES)) {
    if (aliases.includes(normalized) || normalizePdfFieldName(tokenKey) === normalized) {
      const value = tokens[tokenKey];
      if (value) return value;
    }
  }

  return null;
}
