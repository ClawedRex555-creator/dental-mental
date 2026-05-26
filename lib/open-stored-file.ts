import { toast } from "sonner";

/** Открывает файл из data URL (PDF, изображения) в новой вкладке или скачивает */
export function openStoredFile(dataUrl: string | undefined, fileName = "document"): boolean {
  if (!dataUrl) {
    toast.error("Файл не прикреплён. Загрузите PDF или фото к документу.");
    return false;
  }

  try {
    const isImage = dataUrl.startsWith("data:image/");
    const isPdf =
      dataUrl.startsWith("data:application/pdf") ||
      fileName.toLowerCase().endsWith(".pdf");

    if (isImage || isPdf) {
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        toast.error("Разрешите всплывающие окна в браузере");
        return downloadDataUrl(dataUrl, fileName);
      }
      if (isImage) {
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(fileName)}</title></head><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUrl}" alt="" style="max-width:100%;max-height:100vh"/></body></html>`
        );
      } else {
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(fileName)}</title></head><body style="margin:0;height:100vh"><embed src="${dataUrl}" type="application/pdf" width="100%" height="100%"/></body></html>`
        );
      }
      w.document.close();
      return true;
    }

    return downloadDataUrl(dataUrl, fileName);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** localStorage ~5MB — предупреждаем о больших файлах */
export function warnIfFileTooLarge(file: File): boolean {
  const maxMb = 4;
  if (file.size > maxMb * 1024 * 1024) {
    toast.warning(
      `Файл больше ${maxMb} МБ — может не сохраниться после перезагрузки. Сожмите PDF или используйте файл меньше.`
    );
    return true;
  }
  return false;
}
