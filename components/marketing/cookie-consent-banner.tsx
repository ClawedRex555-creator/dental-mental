"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PLATFORM_OPERATOR, YANDEX_METRIKA_ID } from "@/lib/platform-legal";

const STORAGE_KEY = "emkaro_cookie_consent_v1";

type ConsentState = {
  necessary: true;
  analytics: boolean;
  decidedAt: string;
};

type YmFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (typeof parsed?.analytics !== "boolean") return null;
    return { necessary: true, analytics: parsed.analytics, decidedAt: parsed.decidedAt };
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean): ConsentState {
  const next: ConsentState = {
    necessary: true,
    analytics,
    decidedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function loadYandexMetrika(counterId: string) {
  if (!counterId || typeof window === "undefined") return;
  if (document.getElementById("yandex-metrika-script")) {
    window.ym?.(Number(counterId), "hit", window.location.href);
    return;
  }

  const ym: YmFunction = function (...args: unknown[]) {
    (ym.a = ym.a || []).push(args);
  };
  ym.l = Date.now();
  window.ym = ym;

  const script = document.createElement("script");
  script.id = "yandex-metrika-script";
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";
  document.head.appendChild(script);

  window.ym(Number(counterId), "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setVisible(true);
      return;
    }
    if (existing.analytics && YANDEX_METRIKA_ID) {
      loadYandexMetrika(YANDEX_METRIKA_ID);
    }
  }, []);

  const decide = (analytics: boolean) => {
    writeConsent(analytics);
    setVisible(false);
    if (analytics && YANDEX_METRIKA_ID) {
      loadYandexMetrika(YANDEX_METRIKA_ID);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Согласие на использование cookie"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl text-sm text-slate-700">
          <p className="font-medium text-slate-900">Мы используем cookie</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Необходимые cookie нужны для работы сайта. Аналитические (Яндекс.Метрика) включаем
            только с вашего согласия. Подробнее — в{" "}
            <Link href={PLATFORM_OPERATOR.cookiesPath} className="text-teal-700 underline">
              Политике cookies
            </Link>{" "}
            и{" "}
            <Link href={PLATFORM_OPERATOR.privacyPath} className="text-teal-700 underline">
              Политике ПДн
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => decide(false)}>
            Только необходимые
          </Button>
          <Button type="button" size="sm" onClick={() => decide(true)}>
            Принять аналитику
          </Button>
        </div>
      </div>
    </div>
  );
}
