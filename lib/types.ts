// Production: auth, RBAC, encryption, audit logs, backups, compliance required.

export type UserRole =
  | "owner"
  | "admin"
  | "doctor"
  | "assistant"
  | "accountant";

export type PatientStatus = "active" | "new" | "archived" | "debtor" | "vip";
export type PatientSource =
  | "Instagram"
  | "Google"
  | "Яндекс"
  | "Рекомендация"
  | "2GIS"
  | "Сайт"
  | "Повторный пациент";

export type Gender = "male" | "female";

export type DisabilityGroup =
  | "none"
  | "group1"
  | "group2"
  | "group3"
  | "child"
  | "not_specified";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "ready_for_payment"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "pending" | "paid" | "partial" | "refunded" | "cancelled";
export type PaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "installment"
  | "insurance";

export type ToothCondition =
  | "healthy"
  | "caries"
  | "filled"
  | "crown"
  | "implant"
  | "missing"
  | "root_treatment"
  | "extraction_needed";

export type ToothTreatmentStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TreatmentPlanStatus =
  | "draft"
  | "proposed"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";

export type OnlineBookingStatus = "new" | "contacted" | "booked" | "cancelled";

export type WarehouseItemStatus =
  | "in_stock"
  | "low"
  | "critical"
  | "expired";

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  birthDate: string;
  gender: Gender;
  address?: string;
  source: PatientSource;
  status: PatientStatus;
  notes?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  createdAt: string;
  balance: number;
  totalSpent: number;
  lastVisitDate?: string;
  nextVisitDate?: string;
  snils?: string;
  passportSeries?: string;
  passportNumber?: string;
  /** Пациент — ребёнок (документы в birthCertificate* и representative*) */
  isChild?: boolean;
  birthCertificateSeries?: string;
  birthCertificateNumber?: string;
  representativeFullName?: string;
  representativePassportSeries?: string;
  representativePassportNumber?: string;
  /** Пациент заведён без СНИЛС и паспорта */
  withoutIdentityDocuments?: boolean;
  diagnosis?: string;
  hadPreviousVisits?: boolean;
  previousVisitsNote?: string;
  disability: DisabilityGroup;
}

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayWorkHours {
  closed?: boolean;
  open?: string;
  close?: string;
}

export type ClinicWeeklySchedule = Record<WeekdayKey, DayWorkHours>;

/** Смена врача на день: работает ли и часы приёма в расписании */
export interface DoctorShiftDay {
  working: boolean;
  startTime: string;
  endTime: string;
}

/** График смен врача на месяц (yyyy-MM) */
export interface DoctorMonthSchedule {
  doctorId: string;
  month: string;
  days: Record<string, DoctorShiftDay | boolean>;
  updatedAt: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  /** Все специализации врача */
  specializations?: string[];
  phone: string;
  email: string;
  /** СНИЛС (для ЕГИСЗ / N3) */
  snils?: string;
  /** OID записи врача в ФРМР */
  frmrOid?: string;
  /** Код должности по справочнику NSI (1.2.643.5.1.13.13.11.1002) */
  positionCode?: string;
  /** IdPosition для N3 AddMedRecord (справочник ИЭМК, не то же что NSI 1002) */
  n3PositionId?: string;
  /** IdSpeciality для N3 AddMedRecord */
  n3SpecialityId?: string;
  /** Отпечаток личной КЭП врача (CryptoPro), для подписи СЭМД */
  certThumbprint?: string;
  avatar?: string;
  /** @deprecated текстовое поле — используйте cabinetId */
  cabinet: string;
  cabinetId?: string;
  address?: string;
  diplomaCertificate?: string;
  commissionPercent: number;
  /** Вознаграждение за услуги категории «Имплантация»: процент или фикс. ₽ за единицу */
  implantFeeType?: "percent" | "rubles";
  implantFee?: number;
  /** Почасовая ставка для ассистента, ₽/час */
  hourlyRate?: number;
  status: "active" | "vacation" | "inactive";
  role: UserRole;
}

export interface Cabinet {
  id: string;
  name: string;
  number: string;
  equipment: string[];
  staffIds: string[];
  status: "active" | "maintenance" | "inactive";
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Примечание к услуге (видно в прайсе и при выборе) */
  notes?: string;
  /** true — в прайсе показывается «от N ₽» (минимальная цена) */
  priceIsFrom?: boolean;
  /** @deprecated используйте notes */
  description?: string;
  active?: boolean;
  /** @deprecated длительность перенесена на запись */
  duration?: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId?: string;
  assistantId?: string;
  /** Отработанные часы ассистента на приёме */
  assistantHours?: number;
  serviceId?: string;
  cabinetId?: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  complaints?: string;
  reason?: string;
  comment?: string;
  price: number;
  paymentStatus: PaymentStatus;
  /** Акт, заполненный врачом */
  workActId?: string;
  /** Визит в другой клинике (только история, не расписание) */
  isOtherClinicVisit?: boolean;
}

export type ClinicDocumentCategory = "contract" | "consent" | "egisz_refusal";

export interface ClinicDocumentTemplate {
  id: string;
  name: string;
  category: ClinicDocumentCategory;
  distribution?: string;
  fileDataUrl?: string;
  fileName?: string;
}

export interface ClinicExpense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  receiptDataUrl?: string;
  /** Сотрудник, оплативший расход из личных средств (к возмещению) */
  paidByStaffId?: string;
}

export interface LegalDocument {
  id: string;
  category: string;
  title: string;
  date: string;
  fileDataUrl?: string;
  fileName?: string;
  notes?: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  workActId?: string;
  complaints: string;
  anamnesis?: string;
  objective?: string;
  diagnosis: string;
  treatment: string;
  recommendations?: string;
  prescriptions?: string;
  files?: string[];
  createdAt: string;
  serviceName?: string;
}

/** vestibular — наружная (щёчная/губная), lingual — внутренняя (язычная/нёбная) */
export type ToothSurface = "vestibular" | "lingual";

export interface ToothRecord {
  toothNumber: number;
  /** Основной статус для совместимости (вычисляется из поверхностей) */
  condition: ToothCondition;
  /** Наружная сторона — несколько диагнозов */
  vestibularConditions?: ToothCondition[];
  /** Внутренняя сторона — несколько диагнозов */
  lingualConditions?: ToothCondition[];
  diagnosis?: string;
  plannedTreatment?: string;
  completedTreatment?: string;
  price?: number;
  status?: ToothTreatmentStatus;
}

export interface TreatmentPlanItem {
  id: string;
  serviceId?: string;
  toothNumber?: number;
  serviceName: string;
  description?: string;
  price: number;
  /** Количество услуг (по умолчанию 1) */
  quantity?: number;
  status: ToothTreatmentStatus;
  stage?: string;
}

export type DiscountType = "percent" | "rubles";

export interface TreatmentPlan {
  id: string;
  patientId: string;
  doctorId: string;
  medicalRecordId?: string;
  title: string;
  items: TreatmentPlanItem[];
  totalAmount: number;
  discountType: DiscountType;
  discount: number;
  finalAmount: number;
  status: TreatmentPlanStatus;
  createdAt: string;
  comment?: string;
}

export interface WorkActItem {
  id: string;
  serviceId?: string;
  serviceName: string;
  quantity: number;
  price: number;
  total: number;
  /** Скидка по строке, % */
  discountPercent?: number;
  /** Категория прайса на момент добавления в акт */
  serviceCategory?: string;
}

export type WorkActType = "services" | "prepayment";

export interface WorkAct {
  id: string;
  actNumber: string;
  actDate: string;
  patientId: string;
  appointmentId?: string;
  medicalRecordId?: string;
  doctorId?: string;
  items: WorkActItem[];
  subtotalAmount: number;
  discountType: DiscountType;
  discount: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  invoiceId?: string;
  createdAt: string;
  notes?: string;
  /** Врач отправил акт администратору */
  submittedToAdmin?: boolean;
  /** services — акт оказанных услуг; prepayment — аванс по плану лечения */
  actType?: WorkActType;
  prepaymentId?: string;
  /** Полная стоимость плана (для акта предоплаты) */
  plannedTotalAmount?: number;
}

export interface PatientPrepayment {
  id: string;
  patientId: string;
  items: { serviceId?: string; serviceName: string; price: number }[];
  /** Сумма услуг до скидки */
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  date: string;
  notes?: string;
  workActId?: string;
  actNumber?: string;
  discountType?: DiscountType;
  discount?: number;
  /** Сумма после скидки */
  finalAmount?: number;
}

export interface Payment {
  id: string;
  patientId: string;
  appointmentId?: string;
  workActId?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  date: string;
  comment?: string;
}

export interface Invoice {
  id: string;
  patientId: string;
  workActId?: string;
  /** К оплате (с учётом скидок), = totalAmount акта */
  amount: number;
  /** Сумма до общей скидки по акту (после скидок по строкам) */
  subtotalAmount?: number;
  discountType?: DiscountType;
  discount?: number;
  discountValue?: number;
  paid: number;
  status: PaymentStatus;
  date: string;
  description: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  purchasePrice: number;
  supplier: string;
  expirationDate?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
}

export interface StaffMember extends Doctor {
  schedule?: string;
  salaryRate?: number;
}

export interface OnlineBookingRequest {
  id: string;
  patientName: string;
  phone: string;
  serviceId: string;
  doctorId?: string;
  date: string;
  time: string;
  comment?: string;
  status: OnlineBookingStatus;
  createdAt: string;
}

export interface PatientFile {
  id: string;
  patientId: string;
  name: string;
  type: "xray" | "ct" | "photo" | "contract" | "consent" | "document" | "other";
  uploadedAt: string;
  dataUrl?: string;
  medicalRecordId?: string;
}

export type PatientNoteCategory = "general" | "reception" | "clinical" | "billing";

export interface PatientNote {
  id: string;
  patientId: string;
  author: string;
  authorId?: string;
  role: UserRole;
  text: string;
  category?: PatientNoteCategory;
  /** Заметка синхронизирована из комментария к плану лечения */
  sourceTreatmentPlanId?: string;
  createdAt: string;
}

export interface ClinicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive";
  /** Связь с карточкой сотрудника (врач, ассистент и т.д.) */
  staffId?: string;
}

export type ThemeMode = "light" | "dark";

export interface ClinicSettings {
  name: string;
  phone: string;
  email: string;
  address: string;
  inn: string;
  /** Текстовое описание (генерируется из weeklySchedule) */
  workHours: string;
  weeklySchedule?: ClinicWeeklySchedule;
  /** @deprecated общая тема клиники — используйте userThemePreferences в store */
  theme?: ThemeMode;
  logo?: string;
}

export interface DashboardKPI {
  revenueToday: number;
  revenueMonth: number;
  appointmentsToday: number;
  newPatients: number;
  patientDebts: number;
  averageCheck: number;
  doctorLoad: number;
  primaryConversion: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
}

export interface AppointmentsDataPoint {
  date: string;
  count: number;
}
