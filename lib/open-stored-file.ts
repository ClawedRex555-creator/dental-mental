import { toast } from "sonner";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";

/** Открывает файл из data URL (PDF, изображения) в новой вкладке или скачивает */
export function openStoredFile(dataUrl: string | undefined, fileName = "document"): boolean {
  if (!dataUrl) {
    toast.error("Файл не прикреплён. Загрузите PDF или фото к документу.");
    return false;
  }

  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed) {
    toast.error("Неподдерживаемый или небезопасный формат файла");
    return false;
  }

  try {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Разрешите всплывающие окна в браузере");
      return downloadDataUrl(parsed.dataUrl, fileName);
    }

    const doc = w.document;
    doc.title = fileName;
    const head = doc.head;
    const meta = doc.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    head.appendChild(meta);

    const body = doc.body;
    body.style.margin = "0";

    if (parsed.kind === "pdf") {
      body.style.height = "100vh";
      const embed = doc.createElement("embed");
      embed.src = parsed.dataUrl;
      embed.type = "application/pdf";
      embed.style.width = "100%";
      embed.style.height = "100%";
      body.appendChild(embed);
    } else {
      body.style.background = "#111";
      body.style.display = "flex";
      body.style.alignItems = "center";
      body.style.justifyContent = "center";
      body.style.minHeight = "100vh";
      const img = doc.createElement("img");
      img.src = parsed.dataUrl;
      img.alt = "";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100vh";
      body.appendChild(img);
    }

    return true;
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

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!parseAllowedDataUrl(result)) {
        reject(new Error("unsupported type"));
        return;
      }
      resolve(result);
    };
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
