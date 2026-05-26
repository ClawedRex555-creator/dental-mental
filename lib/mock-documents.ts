import type { ClinicDocumentTemplate } from "./types";

export const DEFAULT_DOCUMENT_TEMPLATES: ClinicDocumentTemplate[] = [
  {
    id: "doc_contract_1",
    name: "Договор на оказание платных медицинских услуг",
    category: "contract",
    distribution: "Взрослые пациенты",
  },
  {
    id: "doc_contract_2",
    name: "Договор (детский)",
    category: "contract",
    distribution: "Дети до 18 лет",
  },
  {
    id: "doc_consent_1",
    name: "Информированное добровольное согласие на лечение",
    category: "consent",
    distribution: "Терапия, хирургия",
  },
  {
    id: "doc_consent_2",
    name: "Согласие на обработку персональных данных",
    category: "consent",
    distribution: "Все пациенты",
  },
  {
    id: "doc_consent_3",
    name: "Согласие на анестезию",
    category: "consent",
    distribution: "Хирургия",
  },
  {
    id: "doc_egisz_refusal",
    name: "Отказ от передачи данных в ЕГИСЗ",
    category: "egisz_refusal",
    distribution: "При отказе от ЕГИСЗ",
  },
];
