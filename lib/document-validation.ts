export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Формат: 123-456-789 01 */
export function formatSnils(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)} ${d.slice(9)}`;
}

/** Серия: 4 цифры, номер: 6 цифр */
export function formatPassportSeries(value: string): string {
  return digitsOnly(value).slice(0, 4);
}

export function formatPassportNumber(value: string): string {
  return digitsOnly(value).slice(0, 6);
}

export function validateSnils(value: string): ValidationResult {
  const d = digitsOnly(value);
  if (!d) return { valid: false, message: "Укажите СНИЛС" };
  if (d.length !== 11) {
    return { valid: false, message: "СНИЛС должен содержать 11 цифр" };
  }

  if (d.slice(0, 9) === "000000000") {
    return { valid: false, message: "Некорректный номер СНИЛС" };
  }

  const coeffs = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * coeffs[i];
  let control = sum % 101;
  if (control === 100) control = 0;
  const expected = Number(d[9] + d[10]);

  if (control !== expected) {
    return { valid: false, message: "Неверная контрольная сумма СНИЛС" };
  }

  return { valid: true };
}

export function validatePassportSeries(value: string): ValidationResult {
  const d = digitsOnly(value);
  if (!d) return { valid: false, message: "Укажите серию паспорта" };
  if (d.length !== 4) {
    return { valid: false, message: "Серия паспорта — 4 цифры" };
  }
  return { valid: true };
}

export function validatePassportNumber(value: string): ValidationResult {
  const d = digitsOnly(value);
  if (!d) return { valid: false, message: "Укажите номер паспорта" };
  if (d.length !== 6) {
    return { valid: false, message: "Номер паспорта — 6 цифр" };
  }
  return { valid: true };
}

export function validatePhone(value: string): ValidationResult {
  const d = digitsOnly(value);
  if (!d) return { valid: false, message: "Укажите телефон" };
  if (d.length < 10 || d.length > 11) {
    return { valid: false, message: "Телефон: 10–11 цифр" };
  }
  return { valid: true };
}
