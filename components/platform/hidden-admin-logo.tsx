"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { APP_NAME } from "@/lib/constants";

const CLICKS_REQUIRED = 5;
const WINDOW_MS = 2000;

/** Скрытый вход супер-админа: 5 быстрых кликов по логотипу на emkaro.ru */
export function HiddenAdminLogo() {
  const router = useRouter();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clicks.current = 0;
    }, WINDOW_MS);

    if (clicks.current >= CLICKS_REQUIRED) {
      clicks.current = 0;
      router.push("/platform/login");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform active:scale-95"
      aria-label={APP_NAME}
    >
      <AppLogo size={56} className="h-14 w-14" />
    </button>
  );
}
