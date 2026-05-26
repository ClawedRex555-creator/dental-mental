import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInYears,
  format,
  parseISO,
  isValid,
} from "date-fns";
import { ru } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(
  date: string | Date | undefined,
  pattern = "dd.MM.yyyy"
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "-";
  return format(d, pattern, { locale: ru });
}

export function formatDateTime(date: string | Date | undefined): string {
  return formatDate(date, "dd.MM.yyyy HH:mm");
}

export function getAge(birthDate: string): number {
  return differenceInYears(new Date(), parseISO(birthDate));
}

export function getFullName(
  firstName: string,
  lastName: string,
  middleName?: string
): string {
  return [lastName, firstName, middleName].filter(Boolean).join(" ");
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return phone;
}
