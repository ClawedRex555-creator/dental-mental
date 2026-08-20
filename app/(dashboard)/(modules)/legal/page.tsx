"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import {
  legalFileUploadErrorMessage,
  readFileAsDataUrl,
  warnIfFileTooLarge,
} from "@/lib/open-stored-file";
import {
  legalDocumentHasFile,
  resolveLegalDocumentDataUrl,
} from "@/lib/resolve-legal-document-source";
import { missingLegalConsentBundleEntries } from "@/lib/legal-consents-bundle.generated";
import {
  deleteLegalDocumentViaCommandApi,
  upsertLegalDocumentViaCommandApi,
} from "@/lib/clinic-legal.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  LEGAL_CATEGORIES,
  LEGAL_CATEGORY_CONSENTS,
  type LegalCategory,
} from "@/lib/legal-categories";
import { getLegalDocumentUploadFeedback } from "@/lib/legal-pdf-upload-feedback";
import type { LegalDocument } from "@/lib/types";

export default function LegalPage() {
  const {
    legalDocuments,
    deletedLegalDocumentIds,
    addLegalDocument,
    updateLegalDocument,
    removeLegalDocument,
  } = useClinicStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LegalCategory>(LEGAL_CATEGORY_CONSENTS);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const bundleImported = useRef(false);

  const persistDocument = async (
    doc: LegalDocument,
    applyLocal: () => void,
    successMessage?: string
  ): Promise<boolean> => {
    beginClinicCommandMutation();
    setBusy(true);
    try {
      const api = await upsertLegalDocumentViaCommandApi(doc);
      if (!api.ok) {
        toast.error(api.error ?? "Не удалось сохранить документ на сервере");
        return false;
      }
      runWithoutClinicFlush(applyLocal);
      markClinicSyncedAfterCommand(api.updatedAt, api.revision);
      useClinicStore.getState().pauseClinicAutoSave(15_000);
      notifyClinicDataChanged();
      if (successMessage) toast.success(successMessage);
      return true;
    } finally {
      endClinicCommandMutation();
      setBusy(false);
    }
  };

  useEffect(() => {
    if (bundleImported.current || busy) return;
    // Не поднимать удалённые согласия заново при возврате на вкладку
    const missing = missingLegalConsentBundleEntries(legalDocuments, {
      deletedIds: deletedLegalDocumentIds,
    });
    if (missing.length === 0) return;
    bundleImported.current = true;
    const today = new Date().toISOString().slice(0, 10);
    void (async () => {
      let added = 0;
      for (const entry of missing) {
        const doc: LegalDocument = {
          id: entry.id,
          title: entry.title,
          category: LEGAL_CATEGORY_CONSENTS,
          date: today,
          templateUrl: entry.templateUrl,
          fileName: entry.fileName,
        };
        const ok = await persistDocument(doc, () => addLegalDocument(doc));
        if (ok) added += 1;
        else break;
      }
      if (added > 0) {
        toast.success(`Добавлен комплект ИДС: ${added} документов`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при первом открытии
  }, [legalDocuments.length, deletedLegalDocumentIds.length]);

  const handleAdd = async (fileDataUrl?: string, fileName?: string): Promise<boolean> => {
    const docTitle = title.trim() || fileName?.replace(/\.[^.]+$/, "") || "";
    if (!docTitle) {
      toast.error("Укажите название документа");
      return false;
    }
    const doc: LegalDocument = {
      id: generateId("legal"),
      title: docTitle,
      category,
      date: new Date().toISOString().slice(0, 10),
      notes: notes.trim() || undefined,
      fileDataUrl,
      fileName,
    };
    const ok = await persistDocument(doc, () => addLegalDocument(doc));
    if (!ok) return false;
    setTitle("");
    setNotes("");
    if (!fileDataUrl) {
      toast.success("Запись создана. Прикрепите файл кнопкой «Загрузить файл»");
    } else if (
      !fileDataUrl.startsWith("data:application/pdf;base64,") &&
      !fileDataUrl.startsWith(
        "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
      )
    ) {
      toast.success("Документ сохранён — нажмите «Открыть»");
    }
    return true;
  };

  const notifyFileUpload = async (dataUrl: string, fileName: string) => {
    const feedback = await getLegalDocumentUploadFeedback(dataUrl);
    if (feedback.status === "other") {
      toast.success(`Файл «${fileName}» прикреплён`);
      return;
    }
    if (feedback.status === "error") {
      toast.warning(`Файл загружен, но не прочитан: ${feedback.message}`);
      return;
    }
    if (feedback.status === "no_fields") {
      toast.warning(`Файл сохранён. ${feedback.message}`, { duration: 14_000 });
      if (feedback.hint) toast.info(feedback.hint, { duration: 14_000 });
      return;
    }
    toast.success(`${fileName}: ${feedback.preview}`, { duration: 10_000 });
  };

  const attachFile = async (docId: string, file: File) => {
    const current = legalDocuments.find((d) => d.id === docId);
    if (!current) return;
    warnIfFileTooLarge(file);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const next: LegalDocument = {
        ...current,
        fileDataUrl: dataUrl,
        fileName: file.name,
        templateUrl: undefined,
      };
      const ok = await persistDocument(next, () =>
        updateLegalDocument(docId, {
          fileDataUrl: dataUrl,
          fileName: file.name,
          templateUrl: undefined,
        })
      );
      if (ok) await notifyFileUpload(dataUrl, file.name);
    } catch (err) {
      toast.error(legalFileUploadErrorMessage(err));
    }
  };

  const openDocument = async (doc: LegalDocument) => {
    const dataUrl = await resolveLegalDocumentDataUrl(doc);
    if (!dataUrl) {
      toast.error("Файл не найден");
      return;
    }
    const { openStoredFile } = await import("@/lib/open-stored-file");
    openStoredFile(dataUrl, doc.fileName ?? doc.title);
  };

  const startEditTitle = (doc: LegalDocument) => {
    setEditingId(doc.id);
    setEditingTitle(doc.title);
  };

  const commitEditTitle = async (docId: string) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      toast.error("Название не может быть пустым");
      return;
    }
    const current = legalDocuments.find((d) => d.id === docId);
    if (!current) return;
    const next: LegalDocument = { ...current, title: nextTitle };
    const ok = await persistDocument(next, () =>
      updateLegalDocument(docId, { title: nextTitle })
    );
    if (!ok) return;
    setEditingId(null);
    setEditingTitle("");
  };

  const handleRemove = async (docId: string) => {
    beginClinicCommandMutation();
    setBusy(true);
    try {
      const api = await deleteLegalDocumentViaCommandApi(docId);
      if (!api.ok) {
        toast.error(api.error ?? "Не удалось удалить документ на сервере");
        return;
      }
      runWithoutClinicFlush(() => removeLegalDocument(docId));
      markClinicSyncedAfterCommand(api.updatedAt, api.revision);
      useClinicStore.getState().pauseClinicAutoSave(15_000);
      notifyClinicDataChanged();
      toast.success("Документ удалён");
    } finally {
      endClinicCommandMutation();
      setBusy(false);
    }
  };

  const importBundle = async () => {
    // Явный импорт может вернуть ранее удалённые согласия комплекта
    const missing = missingLegalConsentBundleEntries(legalDocuments, {
      deletedIds: deletedLegalDocumentIds,
      includeDeleted: true,
    });
    if (missing.length === 0) {
      toast.info("Комплект ИДС уже добавлен");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let added = 0;
    for (const entry of missing) {
      const doc: LegalDocument = {
        id: entry.id,
        title: entry.title,
        category: LEGAL_CATEGORY_CONSENTS,
        date: today,
        templateUrl: entry.templateUrl,
        fileName: entry.fileName,
      };
      const ok = await persistDocument(doc, () => addLegalDocument(doc));
      if (!ok) break;
      added += 1;
    }
    if (added > 0) toast.success(`Добавлено согласий: ${added}`);
  };

  const grouped = LEGAL_CATEGORIES.map((cat) => ({
    cat,
    docs: legalDocuments.filter((d) => d.category === cat),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Юр. отдел</h1>
          <p className="text-sm text-slate-500">
            Юридический сборник клиники: журналы, договоры, согласия, карточка здоровья, книги учёта, акты
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void importBundle()}
        >
          Импортировать комплект ИДС
        </Button>
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
              Прикрепите шаблон (.docx или PDF) или используйте встроенный комплект ИДС.
              Название можно изменить у любой карточки (иконка карандаша).
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleAdd()}
            >
              <Plus className="h-4 w-4" />
              Добавить без файла
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-700">
              <Upload className="h-4 w-4" />
              Добавить с файлом
              <input
                type="file"
                accept=".pdf,image/*,.docx"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  warnIfFileTooLarge(file);
                  try {
                    const dataUrl = await readFileAsDataUrl(file);
                    const ok = await handleAdd(dataUrl, file.name);
                    if (ok) await notifyFileUpload(dataUrl, file.name);
                  } catch (err) {
                    toast.error(legalFileUploadErrorMessage(err));
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
          <h2 className="text-lg font-semibold text-slate-900">
            {cat}
            {docs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">({docs.length})</span>
            )}
          </h2>
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400">Нет документов</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {docs.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editingId === doc.id ? (
                          <div className="flex gap-2">
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitEditTitle(doc.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void commitEditTitle(doc.id)}
                            >
                              OK
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-1">
                            <p className="font-medium">{doc.title}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => startEditTitle(doc)}
                              title="Изменить название"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-400" />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-slate-500">{doc.date}</p>
                        {doc.fileName && (
                          <p className="mt-1 truncate text-xs text-teal-800">
                            {doc.fileName}
                          </p>
                        )}
                        {doc.templateUrl && !doc.fileDataUrl && (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            Встроенный шаблон
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
                        disabled={busy}
                        onClick={() => void handleRemove(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={!legalDocumentHasFile(doc)}
                        onClick={() => void openDocument(doc)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть
                      </Button>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        {legalDocumentHasFile(doc) ? "Заменить файл" : "Загрузить файл"}
                        <input
                          type="file"
                          accept=".pdf,image/*,.docx"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void attachFile(doc.id, file);
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
