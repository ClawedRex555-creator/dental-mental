import type { UserRole } from "@/lib/types";

/** Только для UI страницы входа — без crypto и без паролей */
export const DEMO_LOGIN_HINTS: Array<{
  login: string;
  role: UserRole;
  name: string;
  passwordHint: string;
}> = [
  {
    login: "owner@clinic.ru",
    role: "owner",
    name: "Владелец клиники",
    passwordHint: "owner123",
  },
  {
    login: "admin@clinic.ru",
    role: "admin",
    name: "Администратор",
    passwordHint: "admin123",
  },
  {
    login: "doctor@clinic.ru",
    role: "doctor",
    name: "Врач (демо)",
    passwordHint: "doctor123",
  },
  {
    login: "assistant@clinic.ru",
    role: "assistant",
    name: "Ассистент (демо)",
    passwordHint: "assistant123",
  },
  {
    login: "accountant@clinic.ru",
    role: "accountant",
    name: "Бухгалтер (демо)",
    passwordHint: "accountant123",
  },
];
