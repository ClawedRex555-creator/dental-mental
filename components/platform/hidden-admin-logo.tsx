"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CLICKS_REQUIRED = 5;
const WINDOW_MS = 2000;

interface HiddenAdminLogoProps {
  className?: string;
  logoSize?: number;
  children?: React.ReactNode;
}

/** Скрытый вход супер-админа: 5 быстрых кликов по логотипу на emkaro.ru */
export function HiddenAdminLogo({
  className,
  logoSize = 56,
  children,
}: HiddenAdminLogoProps) {
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
      className={cn(
        "flex items-center justify-center rounded-2xl transition-transform active:scale-95",
        className
      )}
      aria-label={APP_NAME}
    >
      {children ?? <AppLogo size={logoSize} className="h-full w-full" />}
    </button>
  );
}
