"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_OPERATOR } from "@/lib/platform-legal";
import {
  marketingConsentShortText,
  pdConsentCheckboxLabel,
} from "@/lib/platform-legal-docs";

interface FormState {
  clinicName: string;
  contactName: string;
  phone: string;
  email: string;
  desiredSlug: string;
  message: string;
  pdConsent: boolean;
  marketingConsent: boolean;
}

const EMPTY_FORM: FormState = {
  clinicName: "",
  contactName: "",
  phone: "",
  email: "",
  desiredSlug: "",
  message: "",
  pdConsent: false,
  marketingConsent: false,
};

export function ConnectionRequestForm({
  variant = "card",
}: {
  variant?: "card" | "landing";
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.pdConsent) {
      toast.error("Нужно согласие на обработку персональных данных");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/landing/connection-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: form.clinicName,
          contactName: form.contactName,
          phone: form.phone,
          email: form.email,
          desiredSlug: form.desiredSlug,
          message: form.message,
          pdConsent: form.pdConsent,
          marketingConsent: form.marketingConsent,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(json.error ?? "Не удалось отправить заявку");
        return;
      }
      setForm(EMPTY_FORM);
      toast.success("Заявка отправлена. Мы свяжемся с вами в ближайшее время.");
    } catch {
      toast.error("Ошибка сети. Попробуйте отправить заявку ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  if (variant === "landing") {
    return (
      <form className="demo-form" id="request" onSubmit={submit}>
        <div className="field">
          <label htmlFor="clinic">Название клиники</label>
          <input
            id="clinic"
            name="clinic"
            placeholder="Например, Тстом"
            required
            value={form.clinicName}
            onChange={(e) => update("clinicName", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="contactName">Ваше имя</label>
          <input
            id="contactName"
            name="name"
            placeholder="Как к вам обращаться"
            required
            value={form.contactName}
            onChange={(e) => update("contactName", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Телефон</label>
          <input
            id="phone"
            name="phone"
            placeholder="+7 (___) ___-__-__"
            required
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="name@clinic.ru"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="desiredSlug">Желаемый адрес клиники</label>
          <input
            id="desiredSlug"
            name="desiredSlug"
            placeholder="например tstom"
            value={form.desiredSlug}
            onChange={(e) => update("desiredSlug", e.target.value.toLowerCase())}
          />
        </div>
        <div className="field">
          <label htmlFor="message">Комментарий</label>
          <textarea
            id="message"
            name="message"
            placeholder="Опционально"
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
          />
        </div>
        <label className="consent">
          <input
            type="checkbox"
            required
            checked={form.pdConsent}
            onChange={(e) => update("pdConsent", e.target.checked)}
          />
          <span>
            {pdConsentCheckboxLabel}{" "}
            <Link href={PLATFORM_OPERATOR.consentPath} target="_blank">
              Согласие
            </Link>
            {" · "}
            <Link href={PLATFORM_OPERATOR.privacyPath} target="_blank">
              Политика
            </Link>
          </span>
        </label>
        <label className="consent">
          <input
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) => update("marketingConsent", e.target.checked)}
          />
          <span>{marketingConsentShortText}</span>
        </label>
        <button className="btn primary field full" type="submit" disabled={submitting}>
          {submitting ? "Отправляем..." : "Получить демонстрацию"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-base font-semibold text-slate-900">Запросить подключение</p>
      <p className="text-sm text-slate-500">
        Оставьте контакты, и мы покажем систему на вашей реальной воронке пациентов.
      </p>
      <Input
        placeholder="Название клиники"
        value={form.clinicName}
        onChange={(e) => update("clinicName", e.target.value)}
        required
      />
      <Input
        placeholder="Контактное лицо"
        value={form.contactName}
        onChange={(e) => update("contactName", e.target.value)}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Телефон"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          required
        />
        <Input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />
      </div>
      <Input
        placeholder="Желаемый адрес (например ulybka)"
        value={form.desiredSlug}
        onChange={(e) => update("desiredSlug", e.target.value.toLowerCase())}
      />
      <textarea
        className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500 transition focus:ring-2"
        placeholder="Комментарий (опционально)"
        value={form.message}
        onChange={(e) => update("message", e.target.value)}
      />

      <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          checked={form.pdConsent}
          onChange={(e) => update("pdConsent", e.target.checked)}
          required
        />
        <span>
          {pdConsentCheckboxLabel}{" "}
          <Link
            href={PLATFORM_OPERATOR.consentPath}
            target="_blank"
            className="text-teal-700 underline"
          >
            Согласие
          </Link>
          {" · "}
          <Link
            href={PLATFORM_OPERATOR.privacyPath}
            target="_blank"
            className="text-teal-700 underline"
          >
            Политика
          </Link>
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          checked={form.marketingConsent}
          onChange={(e) => update("marketingConsent", e.target.checked)}
        />
        <span>{marketingConsentShortText}</span>
      </label>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Отправляем..." : "Отправить заявку"}
      </Button>
    </form>
  );
}
