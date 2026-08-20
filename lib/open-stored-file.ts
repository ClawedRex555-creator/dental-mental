import { toast } from "sonner";
import { parseAllowedDataUrl, type ParsedAllowedDataUrl } from "@/lib/safe-data-url";

/** Резервирует вкладку в момент клика (до async), чтобы браузер не блокировал popup */
export function reserveBrowserTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function closeBrowserTab(tab: Window | null | undefined): void {
  if (!tab) return;
  try {
    if (!tab.closed) tab.close();
  } catch {
    /* ignore */
  }
}

function isTabAccessible(tab: Window | null): tab is Window {
  if (!tab) return false;
  try {
    return !tab.closed;
  } catch {
    return true;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeHtmlToTab(tab: Window, html: string): boolean {
  try {
    const doc = tab.document;
    doc.open();
    doc.write(html);
    doc.close();
    return true;
  } catch {
    return false;
  }
}

/** Показать «загрузка» в зарезервированной вкладке (пока готовится PDF) */
export function showTabLoading(tab: Window, message = "Подготовка документа…"): void {
  writeHtmlToTab(
    tab,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Документ</title></head>` +
      `<body style="margin:0;font-family:system-ui,sans-serif;padding:2rem;color:#334155">` +
      `<p>${escapeHtml(message)}</p></body></html>`
  );
}

function navigateTabToUrl(tab: Window, url: string): boolean {
  try {
    tab.location.href = url;
    return true;
  } catch {
    try {
      tab.location.assign(url);
      return true;
    } catch {
      return false;
    }
  }
}

function scheduleBlobUrlRevoke(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

function isNonEmptyPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 64) return false;
  const head = String.fromCharCode(...bytes.slice(0, 5));
  return head.startsWith("%PDF");
}

const PRINT_ON_LOAD_SCRIPT =
  `<script>function __emkaroPrint(){try{window.focus();window.print();}catch(e){}}` +
  `window.addEventListener("load",function(){setTimeout(__emkaroPrint,400);});` +
  `setTimeout(__emkaroPrint,2000);</script>`;

function buildPdfPrintShellHtml(
  blobUrl: string,
  title: string,
  autoPrint: boolean
): string {
  const safeTitle = escapeHtml(title);
  const safeUrl = blobUrl.replace(/"/g, "&quot;");
  return (
    `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">` +
    `<title>${safeTitle}</title>` +
    `<style>html,body{margin:0;height:100%;}embed{width:100%;height:100%;}</style></head>` +
    `<body><embed src="${safeUrl}" type="application/pdf" />` +
    (autoPrint ? PRINT_ON_LOAD_SCRIPT : "") +
    `</body></html>`
  );
}

function buildImagePrintShellHtml(
  src: string,
  title: string,
  autoPrint: boolean
): string {
  const safeTitle = escapeHtml(title);
  const safeSrc = src.replace(/"/g, "&quot;");
  return (
    `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">` +
    `<title>${safeTitle}</title></head>` +
    `<body style="margin:0;text-align:center">` +
    `<img src="${safeSrc}" alt="" style="max-width:100%;max-height:100vh" />` +
    (autoPrint ? PRINT_ON_LOAD_SCRIPT : "") +
    `</body></html>`
  );
}

export type PrintInTabOptions = {
  /** По умолчанию true. При нескольких вкладках оставляйте true только у первой. */
  autoPrint?: boolean;
};

/** Печать HTML в заранее открытой вкладке (как акт оказанных услуг) */
export function printHtmlDocumentInTab(
  tab: Window | null,
  html: string,
  options?: PrintInTabOptions
): boolean {
  const autoPrint = options?.autoPrint !== false;
  let payload = html;
  if (!autoPrint) {
    payload = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    if (!/Ctrl\+P|Cmd\+P/.test(payload)) {
      payload = payload.replace(
        /<\/body>/i,
        `<p style="margin:16px;font:14px system-ui,sans-serif">Нажмите Ctrl+P (Cmd+P) для печати</p></body>`
      );
    }
  }

  if (isTabAccessible(tab) && writeHtmlToTab(tab, payload)) return true;
  closeBrowserTab(tab);

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Разрешите всплывающие окна для печати");
    return false;
  }
  if (writeHtmlToTab(win, payload)) return true;
  closeBrowserTab(win);
  toast.error("Не удалось открыть окно печати");
  return false;
}

/** Печать PDF из байтов в заранее открытой вкладке */
export function printPdfBytesInTab(
  tab: Window | null,
  bytes: Uint8Array,
  fileName = "document.pdf",
  options?: PrintInTabOptions
): boolean {
  if (!isNonEmptyPdfBytes(bytes)) {
    closeBrowserTab(tab);
    toast.error("PDF пустой или повреждён — перезагрузите файл в юр. отделе");
    return false;
  }

  const autoPrint = options?.autoPrint !== false;
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  scheduleBlobUrlRevoke(url);

  const html = buildPdfPrintShellHtml(url, fileName, autoPrint);
  if (isTabAccessible(tab) && writeHtmlToTab(tab, html)) return true;
  closeBrowserTab(tab);

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Разрешите всплывающие окна для печати");
    return downloadBlob(blob, fileName);
  }
  if (writeHtmlToTab(win, html)) return true;
  closeBrowserTab(win);

  const viewer = window.open(url, "_blank", "noopener,noreferrer");
  if (viewer) return true;
  return downloadBlob(blob, fileName);
}

/** Печать PDF/изображения из data URL в заранее открытой вкладке */
export function printStoredDataUrlInTab(
  tab: Window | null,
  dataUrl: string | undefined,
  fileName = "document"
): boolean {
  if (!dataUrl) {
    closeBrowserTab(tab);
    toast.error("Файл не прикреплён. Загрузите PDF или фото к документу.");
    return false;
  }

  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed) {
    closeBrowserTab(tab);
    toast.error(
      "Файл не открывается: слишком большой или неподдерживаемый формат. Загрузите PDF до 4 МБ."
    );
    return false;
  }

  if (parsed.kind === "pdf") {
    const base64 = parsed.dataUrl.split(",")[1] ?? "";
    if (!base64) {
      closeBrowserTab(tab);
      toast.error("PDF пустой — загрузите файл заново в юр. отделе");
      return false;
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return printPdfBytesInTab(tab, bytes, fileName);
  }

  const html = buildImagePrintShellHtml(parsed.dataUrl, fileName, true);
  if (isTabAccessible(tab) && writeHtmlToTab(tab, html)) return true;
  closeBrowserTab(tab);
  return printHtmlDocumentInTab(null, html);
}

/** @deprecated Используйте printPdfBytesInTab с вкладкой, зарезервированной по клику */
export async function printPdfBytes(bytes: Uint8Array, fileName = "document.pdf"): Promise<boolean> {
  return printPdfBytesInTab(reserveBrowserTab(), bytes, fileName);
}

/** @deprecated Используйте printStoredDataUrlInTab */
export async function printStoredDataUrl(
  dataUrl: string | undefined,
  fileName = "document"
): Promise<boolean> {
  return printStoredDataUrlInTab(reserveBrowserTab(), dataUrl, fileName);
}

/** @deprecated Используйте printHtmlDocumentInTab */
export async function printHtmlDocument(html: string): Promise<boolean> {
  return printHtmlDocumentInTab(reserveBrowserTab(), html);
}

function renderParsedImageInTab(
  tab: Window,
  parsed: ParsedAllowedDataUrl,
  fileName: string
): boolean {
  if (parsed.kind === "pdf") return false;
  const title = escapeHtml(fileName);
  const src = escapeHtml(parsed.dataUrl);
  return writeHtmlToTab(
    tab,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh">` +
      `<img src="${src}" alt="" style="max-width:100%;max-height:100vh" />` +
      `</body></html>`
  );
}

/** Открывает PDF из байтов в заранее зарезервированной вкладке или скачивает */
export function openPdfBytesInTab(
  tab: Window | null,
  bytes: Uint8Array,
  fileName = "document.pdf"
): boolean {
  try {
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    if (isTabAccessible(tab)) {
      if (navigateTabToUrl(tab, url)) {
        scheduleBlobUrlRevoke(url);
        return true;
      }
      closeBrowserTab(tab);
    }

    URL.revokeObjectURL(url);
    return openPdfBytes(bytes, fileName);
  } catch {
    closeBrowserTab(tab);
    toast.error("Не удалось открыть PDF");
    return false;
  }
}

/** Открывает PDF из байтов: вкладка → новое окно → скачивание */
export function openPdfBytesWithFallbacks(
  tab: Window | null,
  bytes: Uint8Array,
  fileName = "document.pdf"
): boolean {
  if (openPdfBytesInTab(tab, bytes, fileName)) return true;
  return openPdfBytes(bytes, fileName);
}

/** Открывает PDF из байтов в новой вкладке */
export function openPdfBytes(bytes: Uint8Array, fileName = "document.pdf"): boolean {
  try {
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      URL.revokeObjectURL(url);
      return downloadBlob(blob, fileName);
    }
    scheduleBlobUrlRevoke(url);
    return true;
  } catch {
    toast.error("Не удалось открыть PDF");
    return false;
  }
}

/** Открывает файл в заранее зарезервированной вкладке */
export function openStoredFileInTab(
  tab: Window | null,
  dataUrl: string | undefined,
  fileName = "document"
): boolean {
  if (!dataUrl) {
    toast.error("Файл не прикреплён. Загрузите PDF или фото к документу.");
    return false;
  }

  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed) {
    toast.error(
      "Файл не открывается: слишком большой или неподдерживаемый формат. Загрузите PDF до 4 МБ."
    );
    return false;
  }

  try {
    if (isTabAccessible(tab)) {
      if (parsed.kind === "pdf") {
        if (navigateTabToUrl(tab, parsed.dataUrl)) return true;
      } else if (renderParsedImageInTab(tab, parsed, fileName)) {
        return true;
      }
      closeBrowserTab(tab);
    }
    return openStoredFile(dataUrl, fileName);
  } catch {
    closeBrowserTab(tab);
    toast.error("Не удалось открыть файл");
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string): boolean {
  if (blob.size < 64) {
    toast.error("Файл пустой — загрузите PDF заново в юр. отделе");
    return false;
  }
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast.info("PDF скачан — откройте файл на компьютере");
  return true;
}

/** Открывает файл из data URL (PDF, изображения) в новой вкладке или скачивает */
export function openStoredFile(dataUrl: string | undefined, fileName = "document"): boolean {
  if (!dataUrl) {
    toast.error("Файл не прикреплён. Загрузите PDF или фото к документу.");
    return false;
  }

  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed) {
    toast.error(
      "Файл не открывается: слишком большой или неподдерживаемый формат. Загрузите PDF до 4 МБ."
    );
    return false;
  }

  try {
    if (parsed.kind === "pdf") {
      const w = window.open(parsed.dataUrl, "_blank", "noopener,noreferrer");
      if (w) return true;
      return downloadDataUrl(parsed.dataUrl, fileName);
    }

    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Разрешите всплывающие окна в браузере");
      return downloadDataUrl(parsed.dataUrl, fileName);
    }

    if (renderParsedImageInTab(w, parsed, fileName)) {
      return true;
    }
    closeBrowserTab(w);
    return downloadDataUrl(parsed.dataUrl, fileName);
  } catch {
    toast.error("Не удалось открыть файл");
    return false;
  }
}

function downloadDataUrl(dataUrl: string, fileName: string): boolean {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast.info("Файл скачан — откройте его на компьютере");
  return true;
}

/** Браузер иногда отдаёт application/octet-stream — восстанавливаем MIME по расширению. */
function normalizeLegalFileDataUrl(dataUrl: string, fileName: string): string {
  if (parseAllowedDataUrl(dataUrl)) return dataUrl;
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) return dataUrl;
  const payload = dataUrl.slice(comma + 1);
  const ext = fileName.split(".").pop()?.toLowerCase();
  const prefixByExt: Record<string, string> = {
    pdf: "data:application/pdf;base64,",
    docx: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,",
    doc: "data:application/msword;base64,",
    png: "data:image/png;base64,",
    jpg: "data:image/jpeg;base64,",
    jpeg: "data:image/jpeg;base64,",
    webp: "data:image/webp;base64,",
  };
  const prefix = ext ? prefixByExt[ext] : undefined;
  if (!prefix) return dataUrl;
  return `${prefix}${payload}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const result = normalizeLegalFileDataUrl(raw, file.name);
      if (!parseAllowedDataUrl(result)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "doc") {
          reject(new Error("unsupported-doc"));
          return;
        }
        if (file.size > 30_000_000 * 0.75) {
          reject(new Error("too-large"));
          return;
        }
        reject(new Error("unsupported type"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function legalFileUploadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "unsupported-doc") {
      return "Старый формат .doc не поддерживается — в Word: «Файл → Сохранить как → .docx»";
    }
    if (err.message === "too-large") {
      return "Файл слишком большой (макс. ~20 МБ). Сожмите PDF или разбейте документ";
    }
    if (err.message === "unsupported type") {
      return "Поддерживаются PDF, DOCX, PNG, JPEG, WebP";
    }
  }
  return "Не удалось прочитать файл";
}

/** Предупреждение о больших файлах (не блокирует загрузку) */
export function warnIfFileTooLarge(file: File, maxMb = 20): boolean {
  if (file.size > maxMb * 1024 * 1024) {
    toast.warning(
      `Файл больше ${maxMb} МБ — при большом числе документов общий объём клиники может не сохраниться на сервер.`
    );
    return true;
  }
  return false;
}
