import type {
  AppointmentStatus,
  DisabilityGroup,
  PatientNoteCategory,
  PatientSource,
  PatientStatus,
  PaymentMethod,
  PaymentStatus,
  ToothCondition,
  ToothTreatmentStatus,
  TreatmentPlanStatus,
  UserRole,
  WarehouseItemStatus,
} from "./types";

export const APP_NAME = "Emkaro";
export const APP_TAGLINE = "Система для стоматологической клиники";
/** Короткий знак в логотипе (sidebar, login) */
export const APP_LOGO_TEXT = "Em";

export const NAV_ITEMS = [
  { href: "/appointments", label: "Расписание", icon: "Calendar", roles: ["owner", "admin", "doctor", "assistant"] as UserRole[] },
  { href: "/patients", label: "Пациенты", icon: "Users", roles: ["owner", "admin", "doctor", "assistant"] as UserRole[] },
  { href: "/medical-records", label: "Медкарты", icon: "FileText", roles: ["owner", "admin", "doctor", "assistant"] as UserRole[] },
  { href: "/treatment-plans", label: "Планы лечения", icon: "ClipboardList", roles: ["owner", "admin", "doctor"] as UserRole[] },
  { href: "/my-salary", label: "Моя зарплата", icon: "Wallet", roles: ["doctor"] as UserRole[] },
  { href: "/finance", label: "Финансы", icon: "Wallet", roles: ["owner", "admin", "accountant"] as UserRole[] },
  { href: "/warehouse", label: "Услуги", icon: "Package", roles: ["owner", "admin", "doctor"] as UserRole[] },
  { href: "/dashboard", label: "Аналитика", icon: "LayoutDashboard", roles: ["owner", "admin", "accountant"] as UserRole[] },
  { href: "/reports", label: "Отчёты", icon: "BarChart3", roles: ["owner", "admin", "accountant"] as UserRole[] },
  { href: "/staff", label: "Сотрудники", icon: "UserCog", roles: ["owner", "admin"] as UserRole[] },
  { href: "/legal", label: "Юр. отдел", icon: "FileText", roles: ["owner", "admin"] as UserRole[] },
  { href: "/online-booking", label: "Онлайн-запись", icon: "Globe", roles: ["owner", "admin"] as UserRole[] },
  { href: "/settings", label: "Настройки", icon: "Settings", roles: ["owner", "admin", "doctor", "assistant", "accountant"] as UserRole[] },
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Владелец клиники",
  admin: "Администратор",
  doctor: "Врач-стоматолог",
  assistant: "Ассистент",
  accountant: "Бухгалтер",
};

export const PATIENT_NOTE_CATEGORIES: {
  id: PatientNoteCategory;
  label: string;
  hint: string;
}[] = [
  { id: "general", label: "Общее", hint: "Любая информация для команды" },
  { id: "reception", label: "Регистратура", hint: "Звонки, переносы, пожелания" },
  { id: "clinical", label: "Клиника", hint: "Особенности лечения, согласования" },
  { id: "billing", label: "Финансы", hint: "Оплата, скидки, договорённости" },
];

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Активный",
  new: "Новый",
  archived: "Архив",
  debtor: "Должник",
  vip: "VIP",
};

/** Стоматологические специализации (роль в клинике — отдельно в ROLE_LABELS) */
export const DOCTOR_SPECIALIZATIONS = [
  "Терапевт",
  "Хирург",
  "Ортопед",
  "Ортодонт",
  "Детский врач-стоматолог",
  "Гигиенист",
  "Пародонтолог",
  "Имплантолог",
] as const;

export const DOCTOR_SPECIALIZATION_OTHER = "Другое";

export const DISABILITY_LABELS: Record<DisabilityGroup, string> = {
  none: "Нет",
  group1: "1 группа",
  group2: "2 группа",
  group3: "3 группа",
  child: "Ребёнок-инвалид",
  not_specified: "Не указано",
};

export const PATIENT_SOURCES: PatientSource[] = [
  "Instagram",
  "Google",
  "Яндекс",
  "Рекомендация",
  "2GIS",
  "Сайт",
  "Повторный пациент",
];

export const OTHER_CLINIC_VISIT_BADGE = "Другая клиника";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Записан",
  confirmed: "Подтверждён",
  arrived: "Пришёл",
  in_progress: "На приёме",
  completed: "Завершён",
  ready_for_payment: "Готов к оплате",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "bg-slate-100 text-slate-700 border-slate-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  arrived: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  completed: "bg-teal-50 text-teal-800 border-teal-200",
  ready_for_payment: "bg-cyan-50 text-cyan-800 border-cyan-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  no_show: "bg-orange-50 text-orange-700 border-orange-200",
};

export const TOOTH_CONDITION_LABELS: Record<ToothCondition, string> = {
  healthy: "Здоров",
  caries: "Кариес",
  filled: "Пломба",
  crown: "Коронка",
  implant: "Имплант",
  missing: "Отсутствует",
  root_treatment: "Лечение каналов",
  extraction_needed: "Требуется удаление",
};

export const TOOTH_CONDITION_COLORS: Record<ToothCondition, string> = {
  healthy: "bg-emerald-100 border-emerald-300 text-emerald-800",
  caries: "bg-amber-100 border-amber-400 text-amber-900",
  filled: "bg-sky-100 border-sky-300 text-sky-800",
  crown: "bg-violet-100 border-violet-300 text-violet-800",
  implant: "bg-cyan-100 border-cyan-400 text-cyan-900",
  missing: "bg-slate-200 border-slate-400 text-slate-500",
  root_treatment: "bg-orange-100 border-orange-300 text-orange-800",
  extraction_needed: "bg-red-100 border-red-300 text-red-800",
};

export const TOOTH_TREATMENT_STATUS_LABELS: Record<ToothTreatmentStatus, string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  completed: "Выполнено",
  cancelled: "Отменено",
};

/** FDI — постоянный прикус, вид спереди */
export const UPPER_RIGHT_TEETH = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const UPPER_LEFT_TEETH = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const LOWER_RIGHT_TEETH = [48, 47, 46, 45, 44, 43, 42, 41] as const;
export const LOWER_LEFT_TEETH = [31, 32, 33, 34, 35, 36, 37, 38] as const;
export const UPPER_TEETH = [...UPPER_RIGHT_TEETH, ...UPPER_LEFT_TEETH];
export const LOWER_TEETH = [...LOWER_RIGHT_TEETH, ...LOWER_LEFT_TEETH];
export const ALL_TEETH = [...UPPER_TEETH, ...LOWER_TEETH];

export const TREATMENT_PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  draft: "Черновик",
  proposed: "Предложен",
  accepted: "Принят",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  installment: "Рассрочка",
  insurance: "Страховая",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Ожидает",
  paid: "Оплачено",
  partial: "Частично",
  refunded: "Возврат",
  cancelled: "Отменён",
};

export const GENDER_LABELS = {
  male: "Мужской",
  female: "Женский",
} as const;

export const ONLINE_BOOKING_STATUS_LABELS = {
  new: "Новая",
  contacted: "Связались",
  booked: "Записан",
  cancelled: "Отменена",
} as const;

export const VIEW_MODE_LABELS = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
} as const;

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const FILE_TYPE_LABELS = {
  xray: "Рентген",
  ct: "КТ",
  photo: "Фото",
  document: "Документ",
  contract: "Договор",
  consent: "Согласие",
  other: "Прочее",
} as const;

export const TREATMENT_STAGES = [
  "Диагностика",
  "Подготовка",
  "Основное лечение",
  "Протезирование/ортодонтия",
  "Контрольный осмотр",
];

export const MEDICAL_PROTOCOLS = [
  "Первичная консультация",
  "Лечение кариеса",
  "Эндодонтия",
  "Удаление зуба",
  "Имплантация",
  "Ортопедия",
  "Ортодонтия",
  "Профессиональная гигиена",
];

export const WAREHOUSE_CATEGORIES = [
  "Анестезия",
  "Пломбировочные материалы",
  "Импланты",
  "Ортопедия",
  "Ортодонтия",
  "Расходники",
  "Инструменты",
  "Дезинфекция",
];

export function getWarehouseStatus(
  quantity: number,
  minQuantity: number,
  expirationDate?: string
): WarehouseItemStatus {
  if (expirationDate && new Date(expirationDate) < new Date()) return "expired";
  if (quantity <= 0) return "critical";
  if (quantity <= minQuantity * 0.5) return "critical";
  if (quantity <= minQuantity) return "low";
  return "in_stock";
}

export const WAREHOUSE_STATUS_LABELS: Record<WarehouseItemStatus, string> = {
  in_stock: "В наличии",
  low: "Мало",
  critical: "Заканчивается",
  expired: "Просрочено",
};

// Общие подписи UI
export const UI = {
  search: "Поиск...",
  searchPatients: "Поиск по имени, телефону, email...",
  searchRecords: "Поиск по пациенту, диагнозу...",
  searchPlans: "Поиск планов...",
  searchItems: "Поиск материалов...",
  all: "Все",
  allStatuses: "Все статусы",
  allDoctors: "Все врачи",
  allCabinets: "Все кабинеты",
  today: "Сегодня",
  save: "Сохранить",
  cancel: "Отмена",
  edit: "Изменить",
  add: "Добавить",
  close: "Закрыть",
  export: "Экспорт",
  noData: "Нет данных",
  total: "всего",
  actions: "Действия",
  patient: "Пациент",
  doctor: "Врач",
  service: "Услуга",
  cabinet: "Кабинет",
  date: "Дата",
  time: "Время",
  status: "Статус",
  amount: "Сумма",
  price: "Цена",
  phone: "Телефон",
  email: "Email",
  age: "Возраст",
  balance: "Баланс",
  lastVisit: "Последний визит",
  nextVisit: "Следующий визит",
  description: "Описание",
  method: "Способ оплаты",
  payments: "Платежи",
  invoices: "Счета",
  complaints: "Жалобы",
  treatment: "Лечение",
  recommendations: "Рекомендации",
  dueDate: "Срок",
  snils: "СНИЛС",
  passport: "Паспорт",
  passportSeries: "Серия",
  passportNumber: "Номер",
  diagnosis: "Диагноз",
  disability: "Инвалидность",
  previousVisits: "Ранние визиты",
  diplomaCertificate: "Сертификат / диплом",
  doctorAddress: "Адрес",
  doctorPhone: "Телефон врача",
  specialization: "Специализация",
  optional: "необязательно",
} as const;
