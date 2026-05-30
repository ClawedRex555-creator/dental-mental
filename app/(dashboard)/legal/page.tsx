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
