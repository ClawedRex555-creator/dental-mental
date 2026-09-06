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

/** Отображение цены услуги: фиксированная или «от N ₽» */
export function formatServicePrice(service: {
  price: number;
  priceIsFrom?: boolean;
}): string {
  const value =
    typeof service.price === "number" && Number.isFinite(service.price)
      ? service.price
      : Number(service.price) || 0;
  const amount = formatCurrency(value);
  return service.priceIsFrom ? `от ${amount}` : amount;
}

/** Примечание к услуге (notes или устаревшее description) */
export function serviceNotes(service: {
  notes?: string;
  description?: string;
}): string | undefined {
  const text = (service.notes ?? service.description)?.trim();
  return text || undefined;
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
  if (!birthDate?.trim()) return 0;
  const d = parseISO(birthDate);
  if (!isValid(d)) return 0;
  return differenceInYears(new Date(), d);
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
