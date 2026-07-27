/** Константы НСИ для сборки CDA (все поддерживаемые СЭМД Emkaro) */

export const NSI_REGISTERED_EMD = "1.2.643.5.1.13.13.11.1520";
export const NSI_REGISTERED_EMD_VERSION = "9.2";

/** Типы/виды мед. документации (ClinicalDocument/code) — как в эталоне SEMD 119 */
export const NSI_MED_DOC_TYPES_CDA = "1.2.643.5.1.13.13.11.1522";
export const NSI_MED_DOC_TYPES_CDA_VERSION = "4.45";
export const NSI_MED_DOC_TYPES_CDA_NAME = "Виды медицинской документации";
export const CDA_HEADER_CODE_CONSULTATION = "5";
export const CDA_HEADER_CODE_CONSULTATION_DISPENSARY = "85";

/** Номер лицензии на мед. деятельность (для ИП обязателен в providerOrganization) */
export const NSI_MED_LICENSE_ROOT = "1.2.643.5.1.13.2.1.1.1504.101";

export const NSI_CONFIDENTIALITY = "1.2.643.5.1.13.13.99.2.285";
export const NSI_CONFIDENTIALITY_VERSION = "1.1";
export const DEFAULT_CONFIDENTIALITY_CODE = "N";
export const DEFAULT_CONFIDENTIALITY_NAME = "Обычный";

export const NSI_REGION = "1.2.643.5.1.13.13.99.2.206";
export const NSI_REGION_VERSION = "6.5";
export const DEFAULT_REGION_CODE = "61";
export const DEFAULT_REGION_NAME = "Ростовская область";
export const DEFAULT_POSTAL_CODE = "344000";

/** Документы, удостоверяющие личность (эталон SEMD 119) */
export const NSI_IDENTITY_DOC_TYPE = "1.2.643.5.1.13.13.99.2.48";
export const NSI_IDENTITY_DOC_TYPE_VERSION = "4.2";

export const NSI_OMS_POLICY_TYPE = "1.2.643.5.1.13.13.11.1035";
export const NSI_OMS_POLICY_TYPE_VERSION = "1.3";

export const NSI_SERVICE_EVENT_V2 = "1.2.643.5.1.13.13.99.2.726";
export const NSI_SERVICE_EVENT_V2_VERSION = "3.38";

export const NSI_ENCOUNTER_KIND = "1.2.643.5.1.13.13.99.2.723";
export const NSI_ENCOUNTER_KIND_VERSION = "1.1";

/** Виды мед. направлений (результат консультации, поле 810) */
export const NSI_MED_REFERRAL_KIND = "1.2.643.5.1.13.13.11.1009";
export const NSI_MED_REFERRAL_KIND_VERSION = "2.4";

export const NSI_GENDER = "1.2.643.5.1.13.13.11.1040";
export const NSI_GENDER_VERSION = "2.1";

export const NSI_POSITIONS = "1.2.643.5.1.13.13.11.1002";
export const NSI_POSITIONS_VERSION = "9.12";

export const NSI_SECTIONS = "1.2.643.5.1.13.13.99.2.197";
/** Версия из эталона SEMD 119 (Obs_Protocol); 7.7 в ФРНСИ отсутствует */
export const NSI_SECTIONS_VERSION = "1.19";

export const NSI_CODED_FIELDS = "1.2.643.5.1.13.13.99.2.166";
export const NSI_CODED_FIELDS_VERSION = "5.2";

export const NSI_MKB10 = "1.2.643.5.1.13.13.11.1005";
export const NSI_MKB10_VERSION = "2.27";

export const NSI_PATIENT_CONDITION = "1.2.643.5.1.13.13.11.1006";
export const NSI_PATIENT_CONDITION_VERSION = "2.4";

export const NSI_MED_SERVICES = "1.2.643.5.1.13.13.11.1070";
export const NSI_MED_SERVICES_VERSION = "2.10";

export const NSI_SNILS_ROOT = "1.2.643.100.3";

export const NSI_SERVICE_EVENT = "1.2.643.5.1.13.13.11.1521";
export const NSI_SERVICE_EVENT_VERSION = "1.1";

/** @deprecated используйте NSI_ENCOUNTER_KIND для componentOf */
export const NSI_ENCOUNTER_TYPE = "1.2.643.5.1.13.13.11.1522";
export const NSI_ENCOUNTER_TYPE_VERSION = "4.45";

/** Место оказания медицинской помощи (DOCINFO поле 801) */
export const NSI_PLACE_OF_CARE = "1.2.643.5.1.13.13.11.1008";
export const NSI_PLACE_OF_CARE_VERSION = "4.3";

/** Вид случая обращения (DOCINFO поле 800) */
export const NSI_VISIT_KIND = "1.2.643.5.1.13.13.11.1007";
export const NSI_VISIT_KIND_VERSION = "2.1";
export const DEFAULT_VISIT_KIND_CODE = "1";
export const DEFAULT_VISIT_KIND_NAME = "Первичный";

export const NSI_REMD_RECIPIENT_ROOT = "1.2.643.5.1.13";

/** Коды секций (справочник 2.197) */
export const CDA_SECTION = {
  DOCINFO: "DOCINFO",
  BENEFITS: "BENEFITS",
  COMPLNTS: "COMPLNTS",
  ANAM: "ANAM",
  LANAM: "LANAM",
  VITALPARAM: "VITALPARAM",
  RESCONS: "RESCONS",
  CONSULT: "CONSULT",
  SERVICES: "SERVICES",
  SCOPORG: "SCOPORG",
  RESINFO: "RESINFO",
  SUM: "SUM",
  EPICRIS: "EPICRIS",
} as const;

export const CDA_SECTION_TITLES: Record<string, string> = {
  DOCINFO: "Сведения о документе",
  BENEFITS: "Льготы",
  COMPLNTS: "Жалобы",
  ANAM: "Анамнез заболевания",
  LANAM: "Анамнез жизни",
  VITALPARAM: "Витальные параметры",
  RESCONS: "Консультации врачей специалистов",
  CONSULT: "Консультации врачей специалистов",
  SERVICES: "Оказанные услуги",
  SCOPORG: "Медицинская организация, куда направлен пациент",
  RESINFO: "Заключение",
  SUM: "Сведения об оплате",
  EPICRIS: "Эпикриз",
};

export const DEFAULT_PATIENT_CONDITION_CODE = "1";
export const DEFAULT_PATIENT_CONDITION_NAME = "Удовлетворительное";

/** Типы медицинских карт (99.2.723), не «вид обращения» */
export const DEFAULT_ENCOUNTER_CODE = "1";
export const DEFAULT_ENCOUNTER_NAME = "Амбулаторная медицинская карта";
export const NSI_ENCOUNTER_KIND_NAME = "Типы медицинских карт";

export const DEFAULT_PLACE_CODE = "1";
export const DEFAULT_PLACE_NAME = "Амбулаторно-поликлиническое учреждение";

export const DEFAULT_SERVICE_EVENT_CODE = "1";
export const DEFAULT_SERVICE_EVENT_NAME = "Консультация";

export const CDA_FIELD_ANAMNESIS_TEXT = "7006";
export const CDA_FIELD_BENEFITS = "811";

/** Для СЭМД «протокол консультации» — код приёма, не пломбы (A16.07.002) */
export const DEFAULT_DENTAL_SERVICE_CODE = "B01.065.001";
export const DEFAULT_DENTAL_SERVICE_NAME =
  "Прием (осмотр, консультация) врача-стоматолога первичный";

export const DEFAULT_RADIOLOGY_SERVICE_CODE = "A06.07.003";
export const DEFAULT_RADIOLOGY_SERVICE_NAME =
  "Прицельная внутриротовая контактная рентгенография";

/** Коды полей 2.166 — как в эталоне SEMD 119 Obs_Protocol */
export const CDA_FIELD = {
  /** DOCINFO: шифр МКБ-10 */
  MKB10: "809",
  /** DOCINFO: вид обращения */
  VISIT_KIND: "800",
  /** DOCINFO: место проведения */
  PLACE_OF_CARE: "801",
  PATIENT_CONDITION: "804",
  OBJECTIVE: "805",
  /** RESCONS заключение + DGN текст диагноза */
  CONCLUSION: "806",
  /** Выявленные патологии (опционально, CD МКБ) */
  PATHOLOGIES: "808",
  /** Результат консультации / вид направления (опционально, CD 1009) */
  CONSULT_RESULT: "810",
  BENEFITS: "811",
  DISEASE_ANAMNESIS: "7006",
  LIFE_ANAMNESIS: "7006",
  COMPLAINTS: "7006",
  REFERRAL_REASON: "12005",
  STUDY_RESULT: "18005",
  PAYMENT_AMOUNT: "12010",
  /** @deprecated alias → MKB10 */
  DIAGNOSIS: "809",
  /** @deprecated alias → CONSULT_RESULT */
  RECOMMENDATIONS: "810",
} as const;

export const CDA_FIELD_NAMES: Record<string, string> = {
  "809": "Шифр по МКБ-10",
  "800": "Обращение",
  "801": "Место проведения",
  "804": "Состояние пациента",
  "805": "Протокол консультации",
  "806": "Заключение консультации",
  "808": "Выявленные патологии",
  "810": "Результат консультации",
  "811": "Льготная категория",
  "7006": "Текстовое описание",
  "12005": "Показания к направлению",
  "18005": "Результат исследования",
  "12010": "Сумма оплаты",
};
