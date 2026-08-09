/**
 * Soft router.push после закрытия Radix Dialog часто не срабатывает.
 * Жёсткий переход — как в оплате акта / карточке пациента.
 */
export function navigateHard(href: string, delayMs = 0): void {
  if (typeof window === "undefined") return;
  if (delayMs <= 0) {
    window.location.assign(href);
    return;
  }
  window.setTimeout(() => {
    window.location.assign(href);
  }, delayMs);
}

export function closeDialogThenNavigate(
  close: () => void,
  href: string,
  delayMs = 50
): void {
  close();
  navigateHard(href, delayMs);
}
