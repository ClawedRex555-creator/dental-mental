/** Сопоставление имён полей PDF (AcroForm) с токенами данных пациента/клиники */
export const PDF_FIELD_TOKEN_ALIASES: Record<string, string[]> = {
  "customer.fullName": [
    "customer_full_name",
    "customerfullname",
    "customer",
    "заказчик",
    "заказчикфио",
    "заказчик.фио",
    "customername",
  ],
  "customer.passport": [
    "customer_passport",
    "customerpassport",
    "заказчикпаспорт",
    "паспортзаказчика",
    "customer_pass",
  ],
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
    "пациент",
  ],
  "patientOrRepresentative.fullName": [
    "patient_or_repr_fio",
    "patient_or_representative",
    "patient_or_repr_name",
    "пациентилипредставитель",
    "пациентпредставитель",
  ],
  "patientOrRepresentative.passport": [
    "patient_or_repr_pass",
    "patient_or_repr_passport",
    "пациентилипредставительпаспорт",
  ],
  "patientOrRepresentative.birthDate": [
    "patient_or_repr_birth",
    "patient_or_repr_birthdate",
    "пациентилипредставительдр",
  ],
  "patient.firstName": ["patientfirstname", "firstname", "имя"],
  "patient.lastName": ["patientlastname", "lastname", "фамилия"],
  "patient.middleName": ["patientmiddlename", "middlename", "отчество"],
  "patient.birthDate": [
    "patient_birth_date",
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
    "patient_contract_no",
    "patient_contract_number",
    "contractnumber",
    "contract",
    "договор",
    "номердоговора",
    "patientcontract",
  ],
  "patient.representativeFullName": [
    "patient_repr_fio",
    "patient_representative_full_name",
    "patient_representativefullname",
    "representative",
    "представитель",
    "законныйпредставитель",
    "representativefullname",
    "sign_repr_fio",
    "podpis_predstavitel",
    "подписьпредставителя",
  ],
  "patient.representativeBirthDate": [
    "patient_repr_birth",
    "patient_representative_birth_date",
    "representativebirthdate",
    "датарожденияпредставителя",
    "дрпредставителя",
  ],
  "patient.representativePassport": [
    "patient_repr_pass",
    "patient_representative_passport",
    "representativepassport",
    "паспортпредставителя",
  ],
  "patient.birthCertificate": [
    "patient_birth_cert",
    "patient_birth_certificate",
    "birthcertificate",
    "свидетельство",
  ],
  "clinic.name": ["clinicname", "clinic_name", "клиника", "клиниканазвание", "исполнитель"],
  "clinic.address": ["clinicaddress", "clinic_address", "адресклиники", "юрадрес"],
  "clinic.phone": ["clinicphone", "clinic_phone", "телефонклиники"],
  "clinic.email": ["clinicemail", "clinic_email"],
  "clinic.inn": ["clinicinn", "inn", "инн"],
  "clinic.workHours": ["clinicworkhours", "workhours", "режимработы"],
  "doctor.name": ["doctorname", "doctor", "врач", "врачфио", "doctor_fio"],
  "doctor.specialization": [
    "doctor_specialty",
    "doctor_specialization",
    "doctorspecialization",
    "specialization",
    "специальность",
    "должность",
  ],
  "appointment.date": [
    "appointment_date",
    "appointmentdate",
    "visitdate",
    "датавизита",
    "датаприема",
  ],
  "date.today": ["date_today", "date", "today", "дата", "датаподписания", "datetoday"],
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
    if (normalizePdfFieldName(tokenKey) === normalized) {
      const value = tokens[tokenKey];
      if (value) return value;
    }
    if (
      aliases.some((alias) => normalizePdfFieldName(alias) === normalized)
    ) {
      const value = tokens[tokenKey];
      if (value) return value;
    }
  }

  return null;
}
