import type {
  Appointment,
  Cabinet,
  ClinicSettings,
  ClinicUser,
  DashboardKPI,
  Doctor,
  Invoice,
  MedicalRecord,
  OnlineBookingRequest,
  Patient,
  PatientFile,
  PatientNote,
  Payment,
  RevenueDataPoint,
  AppointmentsDataPoint,
  Service,
  Task,
  ToothRecord,
  TreatmentPlan,
  WarehouseItem,
} from "./types.ts";
import { ALL_TEETH } from "./constants.ts";
import { defaultWeeklySchedule, formatWeeklyScheduleSummary } from "./clinic-schedule.ts";

const defaultSchedule = defaultWeeklySchedule();

export const clinicSettings: ClinicSettings = {
  name: "Моя клиника",
  phone: "",
  email: "",
  address: "",
  inn: "",
  workHours: formatWeeklyScheduleSummary(defaultSchedule),
  weeklySchedule: defaultSchedule,
};

export const cabinets: Cabinet[] = [];

/** Демо-сотрудники, связанные с учётками входа (см. lib/seed-auth-accounts.ts) */
export const doctors: Doctor[] = [
  {
    id: "doc-demo",
    name: "Врач (демо)",
    specialization: "Терапевт",
    specializations: ["Терапевт"],
    phone: "+79000000001",
    email: "doctor@clinic.ru",
    cabinet: "—",
    commissionPercent: 25,
    status: "active",
    role: "doctor",
  },
  {
    id: "doc-assistant-demo",
    name: "Ассистент (демо)",
    specialization: "Ассистент",
    phone: "+79000000002",
    email: "assistant@clinic.ru",
    cabinet: "—",
    commissionPercent: 0,
    hourlyRate: 500,
    status: "active",
    role: "assistant",
  },
];

export const currentUser: ClinicUser = {
  id: "user1",
  name: "Администратор",
  email: "",
  role: "owner",
  status: "active",
};

export const services: Service[] = [];

export const initialPatients: Patient[] = [];
export const initialAppointments: Appointment[] = [];
export const initialMedicalRecords: MedicalRecord[] = [];
export const initialTreatmentPlans: TreatmentPlan[] = [];
export const initialPayments: Payment[] = [];
export const initialInvoices: Invoice[] = [];
export const initialWarehouse: WarehouseItem[] = [];
export const initialTasks: Task[] = [];
export const initialOnlineBookings: OnlineBookingRequest[] = [];
export const initialPatientFiles: PatientFile[] = [];
export const initialPatientNotes: PatientNote[] = [];

export function generateDefaultTeeth(): ToothRecord[] {
  return ALL_TEETH.map((num) => ({
    toothNumber: num,
    condition: "healthy",
    vestibularConditions: ["healthy"],
    lingualConditions: [],
    status: "planned",
  }));
}

export const dashboardKPI: DashboardKPI = {
  revenueToday: 0,
  revenueMonth: 0,
  appointmentsToday: 0,
  newPatients: 0,
  patientDebts: 0,
  averageCheck: 0,
  doctorLoad: 0,
  primaryConversion: 0,
};

export const revenueChartData: RevenueDataPoint[] = [];
export const appointmentsChartData: AppointmentsDataPoint[] = [];
export const topDoctorsRevenue: { doctor: Doctor; revenue: number; appointments: number }[] = [];
export const popularServices: { service: Service; count: number; revenue: number }[] = [];
