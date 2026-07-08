/** Функциональные блоки МИС — управляются супер-админом платформы */
export type SystemModuleId =
  | "appointments"
  | "patients"
  | "medical_records"
  | "treatment_plans"
  | "finance"
  | "analytics"
  | "reports"
  | "warehouse"
  | "staff"
  | "legal"
  | "online_booking"
  | "my_salary"
  | "settings"
  | "egisz"
  | "notifications";

export type ClinicModules = Record<SystemModuleId, boolean>;

export const SYSTEM_MODULE_IDS: SystemModuleId[] = [
  "appointments",
  "patients",
  "medical_records",
  "treatment_plans",
  "finance",
  "analytics",
  "reports",
  "warehouse",
  "staff",
  "legal",
  "online_booking",
  "my_salary",
  "settings",
  "egisz",
  "notifications",
];

/** Модули, которые супер-админ может отключать. «Настройки» всегда доступны (профиль, клиника, тема). */
export const CONFIGURABLE_MODULE_IDS: SystemModuleId[] = SYSTEM_MODULE_IDS.filter(
  (id) => id !== "settings"
);

export const MODULE_LABELS: Record<SystemModuleId, string> = {
  appointments: "Расписание",
  patients: "Пациенты",
  medical_records: "Медкарты",
  treatment_plans: "Планы лечения",
  finance: "Финансы",
  analytics: "Аналитика (сегодня)",
  reports: "Отчёты (период)",
  warehouse: "Услуги / склад",
  staff: "Сотрудники",
  legal: "Юр. отдел",
  online_booking: "Онлайн-запись",
  my_salary: "Моя зарплата / учёт в финансах",
  settings: "Настройки",
  egisz: "ЕГИСЗ",
  notifications: "Уведомления",
};

/** Маршрут → модуль */
export const PATH_TO_MODULE: Record<string, SystemModuleId> = {
  "/appointments": "appointments",
  "/patients": "patients",
  "/medical-records": "medical_records",
  "/treatment-plans": "treatment_plans",
  "/finance": "finance",
  "/dashboard": "analytics",
  "/reports": "reports",
  "/warehouse": "warehouse",
  "/staff": "staff",
  "/legal": "legal",
  "/online-booking": "online_booking",
  "/my-salary": "my_salary",
  "/notifications": "notifications",
};

export const NAV_HREF_TO_MODULE: Record<string, SystemModuleId> = {
  "/appointments": "appointments",
  "/patients": "patients",
  "/medical-records": "medical_records",
  "/treatment-plans": "treatment_plans",
  "/finance": "finance",
  "/dashboard": "analytics",
  "/reports": "reports",
  "/warehouse": "warehouse",
  "/staff": "staff",
  "/legal": "legal",
  "/online-booking": "online_booking",
  "/my-salary": "my_salary",
  "/notifications": "notifications",
};

export function defaultClinicModules(): ClinicModules {
  return {
    appointments: true,
    patients: true,
    medical_records: true,
    treatment_plans: true,
    finance: true,
    analytics: true,
    reports: true,
    warehouse: true,
    staff: true,
    legal: true,
    online_booking: true,
    my_salary: true,
    settings: true,
    egisz: false,
    notifications: false,
  };
}

export function parseClinicModules(raw: unknown): ClinicModules {
  const defaults = defaultClinicModules();
  if (!raw || typeof raw !== "object") return defaults;
  const d = raw as Record<string, unknown>;
  const out = { ...defaults };
  for (const id of SYSTEM_MODULE_IDS) {
    if (typeof d[id] === "boolean") out[id] = d[id];
  }
  out.settings = true;
  return out;
}

/**
 * Возможности без отдельного URL (модалки, вкладки настроек):
 * — печать договоров при «Пациент пришёл» → `legal`
 * — блок ЕГИСЗ в настройках, API `/api/egisz/*` → `egisz`
 * — вкладка «Зарплаты» и сводка зарплат в финансах, /my-salary → `my_salary`
 */

export function resolvePathModule(pathname: string): SystemModuleId | null {
  const path = pathname.split("?")[0];
  for (const [prefix, moduleId] of Object.entries(PATH_TO_MODULE)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return moduleId;
  }
  return null;
}

export function isModuleEnabled(
  modules: ClinicModules,
  moduleId: SystemModuleId
): boolean {
  if (moduleId === "settings") return true;
  return modules[moduleId] !== false;
}
