"use client";

import { useLayoutEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ConnectionRequestForm } from "@/components/marketing/connection-request-form";
import { CookieConsentBanner } from "@/components/marketing/cookie-consent-banner";
import { cn } from "@/lib/utils";
import "./emkaro-landing.css";

type ClinicCard = { id: string; slug: string; name: string };

/** Клиники на лендинге: логотип + публичный сайт (не поддомен Emkaro). */
const SHOWCASE_CLINICS = [
  {
    id: "tstom",
    name: "Тстом",
    city: "Ростов-на-Дону",
    websiteUrl: "https://zoon.ru/rostov/medical/stomatologicheskaya_klinika_tstom/",
    websiteLabel: "Сайт клиники",
    logoSrc: "/marketing/clinics/tstom.png",
  },
  {
    id: "elanar",
    name: "Эланар",
    city: "Ростов-на-Дону",
    websiteUrl: "https://elanar.clients.site/",
    websiteLabel: "Сайт клиники",
    logoSrc: "/marketing/clinics/elanar.png",
  },
] as const;

function SlotPortal({ slotId, children }: { slotId: string; children: ReactNode }) {
  const [node, setNode] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setNode(document.getElementById(slotId));
  }, [slotId]);
  if (!node) return null;
  return createPortal(children, node);
}

function ClinicGrid() {
  return (
    <div className="clinic-grid">
      {SHOWCASE_CLINICS.map((clinic) => (
        <article className="clinic-card" key={clinic.id}>
          <div className="clinic-logo clinic-logo-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={clinic.logoSrc} alt={clinic.name} width={180} height={180} />
          </div>
          <div className="clinic-city">{clinic.city}</div>
          <a
            className="clinic-site-link"
            href={clinic.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {clinic.websiteLabel}
          </a>
        </article>
      ))}
      <article className="clinic-card clinic-placeholder">
        <div>
          <div className="clinic-logo">+</div>
          <strong>Место для следующей клиники</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>Следующими здесь можете стать Вы</p>
        </div>
      </article>
    </div>
  );
}

export function EmkaroMarketingSite({
  html,
}: {
  html: string;
  clinics: ClinicCard[];
  rootDomain: string;
  databaseEnabled: boolean;
}) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useLayoutEffect(() => {
    const brand = document.getElementById("emkaro-brand-slot");
    if (!brand) return;
    let clicks = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onClick = () => {
      clicks += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        clicks = 0;
      }, 2000);
      if (clicks >= 5) {
        clicks = 0;
        router.push("/platform/login");
      }
    };
    brand.addEventListener("click", onClick);
    brand.setAttribute("role", "button");
    brand.setAttribute("tabindex", "0");
    return () => {
      brand.removeEventListener("click", onClick);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  useLayoutEffect(() => {
    const menuBtn = document.querySelector<HTMLButtonElement>(".emkaro-marketing .menu-btn");
    if (!menuBtn) return;

    const onMenuClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      setNavOpen((open) => !open);
    };
    menuBtn.addEventListener("click", onMenuClick);

    menuBtn.setAttribute("aria-expanded", navOpen ? "true" : "false");
    menuBtn.setAttribute("aria-label", navOpen ? "Закрыть меню" : "Открыть меню");
    menuBtn.textContent = navOpen ? "✕" : "☰";

    document.documentElement.classList.toggle("emkaro-nav-locked", navOpen);
    return () => {
      menuBtn.removeEventListener("click", onMenuClick);
      document.documentElement.classList.remove("emkaro-nav-locked");
    };
  }, [navOpen]);

  const onShellClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".menu-btn")) return;
    if (target.closest(".nav-links a")) {
      setNavOpen(false);
    }
  };

  return (
    <div
      className={cn("emkaro-marketing", navOpen && "nav-open")}
      onClick={onShellClick}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <SlotPortal slotId="emkaro-clinics-slot">
        <ClinicGrid />
      </SlotPortal>
      <SlotPortal slotId="emkaro-form-slot">
        <ConnectionRequestForm variant="landing" />
      </SlotPortal>
      <CookieConsentBanner />
    </div>
  );
}
