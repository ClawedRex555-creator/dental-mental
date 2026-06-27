"use client";

import { useState } from "react";
import { Plus, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useClinicStore } from "@/store/useClinicStore";
import {
  openStoredFile,
  readFileAsDataUrl,
  warnIfFileTooLarge,
} from "@/lib/open-stored-file";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { LEGAL_CATEGORIES, type LegalCategory } from "@/lib/legal-categories";
import {
  LEGAL_PDF_FIELD_CATALOG,
  LEGAL_PDF_FIELD_GROUP_LABELS,
  LEGAL_PDF_TEMPLATE_PRESETS,
} from "@/lib/legal-pdf-fields";

export default function LegalPage() {
  const { legalDocuments, addLegalDocument, updateLegalDocument, removeLegalDocument } =
    useClinicStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LegalCategory>(LEGAL_CATEGORIES[0]);
  const [notes, setNotes] = useState("");

  const handleAdd = (fileDataUrl?: string, fileName?: string) => {
    const docTitle = title.trim() || fileName?.replace(/\.[^.]+$/, "") || "";
    if (!docTitle) {
      toast.error("Укажите название документа");
      return;
    }
    addLegalDocument({
      id: generateId("legal"),
      title: docTitle,
      category,
      date: new Date().toISOString().slice(0, 10),
      notes: notes.trim() || undefined,
      fileDataUrl,
      fileName,
    });
    setTitle("");
    setNotes("");
    toast.success(
      fileDataUrl
        ? "Документ сохранён — нажмите «Открыть»"
        : "Запись создана. Прикрепите файл кнопкой «Загрузить файл»"
    );
  };

  const attachFile = async (docId: string, file: File) => {
    warnIfFileTooLarge(file);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateLegalDocument(docId, { fileDataUrl: dataUrl, fileName: file.name });
      toast.success("Файл прикреплён");
    } catch {
      toast.error("Не удалось прочитать файл");
    }
  };

  const grouped = LEGAL_CATEGORIES.map((cat) => ({
    cat,
    docs: legalDocuments.filter((d) => d.category === cat),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Юр. отдел</h1>
        <p className="text-sm text-slate-500">
          Юридический сборник клиники: журналы, договоры, книги учёта, акты
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Добавить документ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              value={category}
              onChange={(e) => setCategory(e.target.value as LegalCategory)}
            >
              {LEGAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Примечание</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-slate-500">
              Для PDF при печати данные подставляются в <strong>поля формы</strong> внутри файла.
              В Word добавьте поля с именами через подчёркивание: patient_full_name,
              customer_full_name, clinic_name (точки Word не принимает). Список — ниже.
              В примечании — плейсхолдеры{" "}
              {"{{patient.fullName}}"} для текстовых документов без PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => handleAdd()}>
              <Plus className="h-4 w-4" />
              Добавить без файла
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-700">
              <Upload className="h-4 w-4" />
              Добавить с файлом
              <input
                type="file"
                accept=".pdf,image/*,.doc,.docx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  warnIfFileTooLarge(file);
                  try {
                    const dataUrl = await readFileAsDataUrl(file);
                    handleAdd(dataUrl, file.name);
                  } catch {
                    toast.error("Не удалось загрузить файл");
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как сделать бланк в Word (меню «Разработчик»)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Word → <strong>Файл → Параметры → Настроить ленту</strong> → включите вкладку{" "}
              <strong>Разработчик</strong>.
            </li>
            <li>
              <strong>Разработчик → Режим конструктора</strong> (должен быть включён).
            </li>
            <li>
              Вставляйте поля через <strong>Разработчик → Элементы управления → Поле формы</strong>{" "}
              (иконка «ab» в группе «Элементы управления») или{" "}
              <strong>Разработчик → Элементы управления для предыдущих версий → Поле текста</strong>{" "}
              — так надёжнее сохраняются поля в PDF.
            </li>
            <li>
              Дважды щёлкните по полю → вкладка <strong>Разработчик → Свойства</strong> → в{" "}
              <strong>Тег</strong> или <strong>Закладка</strong> впишите имя латиницей с{" "}
              <strong>подчёркиваниями</strong>, например{" "}
              <code className="text-xs">patient_full_name</code> или{" "}
              <code className="text-xs">customer_full_name</code> (точку Word не пропускает).
            </li>
            <li>
              Для строки «Заказчик: ________» — поле{" "}
              <code className="text-xs">customer_full_name</code> (для ребёнка подставится
              представитель).
            </li>
            <li>
              <strong>Файл → Сохранить как → PDF</strong>. Не печатайте на принтер «в PDF» — только
              «Сохранить как PDF», иначе поля формы могут пропасть.
            </li>
            <li>
              Загрузите PDF в этот раздел или в шаблоны при визите. При статусе записи{" "}
              <strong>«Пришёл»</strong> система заполнит поля автоматически.
            </li>
          </ol>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Скан, фото или бланк с одними подчёркиваниями без полей формы заполнить нельзя. В
            примечании к документу можно использовать текстовые плейсхолдеры{" "}
            {"{{patient.fullName}}"} — они работают только для печати из текста, не для PDF.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Типовые наборы полей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {LEGAL_PDF_TEMPLATE_PRESETS.map((preset) => (
            <div key={preset.title}>
              <p className="text-sm font-medium text-slate-900">{preset.title}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {preset.fields.map((f) => (
                  <code
                    key={f}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800"
                  >
                    {f}
                  </code>
                ))}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Справочник имён полей</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-4 py-2 font-medium">Имя в Word / PDF</th>
                <th className="px-4 py-2 font-medium">Группа</th>
                <th className="px-4 py-2 font-medium">Что подставится</th>
                <th className="px-4 py-2 font-medium">Подсказка</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL_PDF_FIELD_CATALOG.map((field) => (
                <tr key={field.wordName} className="border-b border-slate-50">
                  <td className="px-4 py-2">
                    <code className="text-xs text-teal-800">{field.wordName}</code>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {LEGAL_PDF_FIELD_GROUP_LABELS[field.group]}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{field.label}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{field.hint ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {grouped.map(({ cat, docs }) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{cat}</h2>
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400">Нет документов</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {docs.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-slate-500">{doc.date}</p>
                        {doc.fileName && (
                          <p className="mt-1 truncate text-xs text-teal-800">
                            {doc.fileName}
                          </p>
                        )}
                        {doc.notes && (
                          <p className="mt-1 text-sm text-slate-600">{doc.notes}</p>
                        )}
                        {doc.fileDataUrl?.startsWith("data:image/") && (
                          <img
                            src={doc.fileDataUrl}
                            alt=""
                            className="mt-2 max-h-32 rounded border object-cover"
                          />
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLegalDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() =>
                          openStoredFile(doc.fileDataUrl, doc.fileName ?? doc.title)
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть
                      </Button>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        {doc.fileDataUrl ? "Заменить файл" : "Загрузить файл"}
                        <input
                          type="file"
                          accept=".pdf,image/*,.doc,.docx"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) attachFile(doc.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
