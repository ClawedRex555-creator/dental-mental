"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageSquare, Plus, Search, Upload } from "lucide-react";
import {
  LEGAL_CATEGORY_CONSENTS,
  LEGAL_CATEGORY_CONTRACTS,
  LEGAL_CATEGORY_EGISZ_REFUSAL,
  LEGAL_CATEGORY_HEALTH_CARD,
  arrivalDocumentsFromLegal,
  type ArrivalPrintDocument,
} from "@/lib/legal-categories";
import {
  buildArrivalDocumentsPrintHtml,
  buildArrivalDocumentTokens,
  isDocxArrivalDocument,
  isPdfArrivalDocument,
} from "@/lib/arrival-documents";
import { fillLegalDocxToPrintHtml, wrapCombinedLegalPrintHtml } from "@/lib/legal-docx-fill";
import { fillLegalPdf, mergePdfByteArrays } from "@/lib/legal-pdf-fill";
import {
  closeBrowserTab,
  printHtmlDocumentInTab,
  printPdfBytesInTab,
  readFileAsDataUrl,
  reserveBrowserTab,
  showTabLoading,
} from "@/lib/open-stored-file";
import { resolveArrivalDocumentDataUrl } from "@/lib/resolve-legal-document-source";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";
import { upsertLegalDocumentViaCommandApi } from "@/lib/clinic-legal.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import { ModuleGate, useIsModuleEnabled } from "@/components/clinic/module-guard";
import { SendToSignConfirmDialog } from "@/components/document-sign/send-to-sign-confirm-dialog";
import { formatPatientDisplayName } from "@/lib/notifications/template-service";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
import type { LegalDocument } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AppointmentDocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  patientId: string;
  doctorId?: string;
  appointmentDate?: string;
}

function arrivalDocMatchesQuery(doc: ArrivalPrintDocument, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    doc.name.toLowerCase().includes(q) ||
    (doc.fileName?.toLowerCase().includes(q) ?? false) ||
    (doc.notes?.toLowerCase().includes(q) ?? false)
  );
}

function filterArrivalDocuments(
  items: ArrivalPrintDocument[],
  query: string
): ArrivalPrintDocument[] {
  const q = query.trim();
  if (!q) return items;
  return items.filter((doc) => arrivalDocMatchesQuery(doc, q));
}

function DocList({
  title,
  items,
  totalCount,
  selected,
  onToggle,
  emptyHint,
  noSearchResultsHint,
  onAttachFile,
}: {
  title: string;
  items: ArrivalPrintDocument[];
  totalCount?: number;
  selected: string[];
  onToggle: (id: string) => void;
  emptyHint: string;
  noSearchResultsHint?: string;
  onAttachFile: (docId: string, file: File) => void;
}) {
  const countLabel =
    totalCount !== undefined && totalCount !== items.length
      ? `${items.length} из ${totalCount}`
      : String(items.length);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">
        {title}
        <span className="ml-1.5 font-normal text-[var(--muted)]">({countLabel})</span>
      </h3>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
        {items.length === 0 ? (
          <p className="p-2 text-xs text-[var(--muted)]">
            {noSearchResultsHint ?? emptyHint}
          </p>
        ) : (
          items.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-2 rounded p-2 hover:bg-[var(--nav-hover-bg)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--foreground)]">{doc.name}</p>
                {doc.notes && <p className="text-xs text-[var(--muted)]">{doc.notes}</p>}
                {doc.fileName && (
                  <p className="text-xs text-teal-600 dark:text-teal-400">Файл: {doc.fileName}</p>
                )}
              </div>
              <label className="cursor-pointer rounded border border-[var(--border)] p-1 hover:bg-[var(--nav-hover-bg)]">
                <Upload className="h-3.5 w-3.5 text-[var(--muted)]" />
                <input
                  type="file"
                  accept=".pdf,image/*,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAttachFile(doc.id, file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AppointmentDocumentsModalBody({
  onDone,
  onOpenChange,
  patientId,
  doctorId,
  appointmentDate,
}: {
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  doctorId?: string;
  appointmentDate?: string;
}) {
  const { legalDocuments, addLegalDocument, updateLegalDocument, patients, clinicSettings, doctors } =
    useClinicStore();

  const patient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId]
  );
  const doctor = useMemo(
    () => (doctorId ? doctors.find((d) => d.id === doctorId) : undefined),
    [doctors, doctorId]
  );
  const patientTokens = useMemo(() => {
    if (!patient) return null;
    return buildArrivalDocumentTokens({
      patient,
      clinic: clinicSettings,
      doctor,
      appointmentDate,
    });
  }, [patient, clinicSettings, doctor, appointmentDate]);

  const { contracts, consents, healthCards, egiszRefusals } = useMemo(
    () => arrivalDocumentsFromLegal(legalDocuments),
    [legalDocuments]
  );

  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);
  const [selectedHealthCards, setSelectedHealthCards] = useState<string[]>([]);
  const [selectedEgiszRefusals, setSelectedEgiszRefusals] = useState<string[]>([]);
  const [sendToEgisz, setSendToEgisz] = useState<"yes" | "no">("yes");
  const [newDocName, setNewDocName] = useState("");
  const [newDocCategory, setNewDocCategory] = useState<
    | typeof LEGAL_CATEGORY_CONTRACTS
    | typeof LEGAL_CATEGORY_CONSENTS
    | typeof LEGAL_CATEGORY_HEALTH_CARD
  >(LEGAL_CATEGORY_CONTRACTS);
  const [pendingFile, setPendingFile] = useState<{ dataUrl: string; name: string } | null>(
    null
  );
  const [docSearch, setDocSearch] = useState("");
  const [signSending, setSignSending] = useState(false);
  const [signButtonLabel, setSignButtonLabel] = useState("Подписать по SMS");
  const [signReady, setSignReady] = useState(true);
  const [signProvider, setSignProvider] = useState<string | null>(null);
  const [confirmSignOpen, setConfirmSignOpen] = useState(false);
  const [desktopSignStatus, setDesktopSignStatus] = useState<string | null>(null);
  const documentSignEnabled = useIsModuleEnabled("document_sign");

  useEffect(() => {
    if (!documentSignEnabled) return;
    void fetch("/api/document-sign/config", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(
        (data: {
          label?: string;
          activeProvider?: string;
          moduleEnabled?: boolean;
          ready?: boolean;
          emkaroSignConfigured?: boolean;
          emkaroSignTenantConfigured?: boolean;
        }) => {
          if (!data.moduleEnabled) return;
          setSignProvider(data.activeProvider ?? null);
          if (data.activeProvider === "emkaro_sign") {
            setSignButtonLabel("Отправить на подпись");
            setSignReady(
              data.ready !== false &&
                data.emkaroSignConfigured !== false &&
                data.emkaroSignTenantConfigured !== false
            );
          } else if (data.activeProvider === "fdoc") {
            setSignButtonLabel("Отправить на подпись (F.Doc)");
            setSignReady(true);
          } else if (data.label) {
            setSignButtonLabel(`Подписать (${data.label})`);
            setSignReady(true);
          }
        }
      )
      .catch(() => undefined);
  }, [documentSignEnabled]);

  const collectSelectedDocuments = useCallback((): ArrivalPrintDocument[] => {
    const toPrint: ArrivalPrintDocument[] = [];
    contracts.forEach((d) => {
      if (selectedContracts.includes(d.id)) toPrint.push(d);
    });
    consents.forEach((d) => {
      if (selectedConsents.includes(d.id)) toPrint.push(d);
    });
    healthCards.forEach((d) => {
      if (selectedHealthCards.includes(d.id)) toPrint.push(d);
    });
    if (sendToEgisz === "no") {
      const selectedRefusals = egiszRefusals.filter((d) =>
        selectedEgiszRefusals.includes(d.id)
      );
      if (selectedRefusals.length > 0) {
        selectedRefusals.forEach((d) => toPrint.push(d));
      } else {
        toPrint.push({
          id: "builtin-egisz-refusal",
          name: "Отказ от передачи данных в ЕГИСЗ",
          kind: "egisz_refusal",
          notes:
            "Пациент уведомлён о праве на отказ от передачи персональных данных в ЕГИСЗ (140-ФЗ).",
        });
      }
    }
    return toPrint;
  }, [
    contracts,
    consents,
    healthCards,
    egiszRefusals,
    selectedContracts,
    selectedConsents,
    selectedHealthCards,
    selectedEgiszRefusals,
    sendToEgisz,
  ]);

  const handleSignBySms = () => {
    if (!patient) {
      toast.error("Пациент не найден — обновите страницу");
      return;
    }
    if (!patient.phone?.trim()) {
      toast.error("У пациента не указан телефон");
      return;
    }
    if (signProvider === "emkaro_sign" && !signReady) {
      toast.error("Emkaro Sign не настроен или клиника не привязана");
      return;
    }

    const toSign = collectSelectedDocuments();
    if (toSign.length === 0) {
      toast.error("Выберите документы для подписи");
      return;
    }

    if (signProvider === "emkaro_sign") {
      setConfirmSignOpen(true);
      return;
    }

    void executeSignSend(toSign);
  };

  const executeSignSend = (toSign: ArrivalPrintDocument[]) => {
    if (!patient) return;
    setSignSending(true);
    void (async () => {
      try {
        await persistEgiszConsent();
        const res = await fetch("/api/document-sign/send", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: patient.id,
            doctorId,
            appointmentDate,
            sendToEgisz,
            documents: toSign.map((d) => ({
              id: d.id,
              name: d.name,
              kind: d.kind,
            })),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          debugOtp?: string;
          debugSignUrl?: string;
          provider?: string;
          externalId?: string;
          desktopStatus?: string;
          alreadyExists?: boolean;
          rejected?: Array<{ title: string; reason: string; requiredMethod?: string }>;
        };
        if (!res.ok) {
          toast.error(data.error ?? "Не удалось отправить", { duration: 12_000 });
          return;
        }

        const rejectedList = data.rejected ?? [];
        if (data.provider === "emkaro_sign") {
          if (!data.externalId) {
            toast.error("Emkaro Sign не создал пакет", { duration: 10_000 });
            return;
          }
          if (data.debugSignUrl) {
            console.info("[emkaro-sign]", data.debugSignUrl);
          }
          setDesktopSignStatus(data.desktopStatus ?? "Пакет создан");
          if (data.alreadyExists) {
            toast.info(data.desktopStatus ?? "Пакет уже существует");
          } else if (rejectedList.length > 0) {
            toast.warning(
              `${data.desktopStatus ?? "Пакет создан"}. Не ушли:\n` +
                rejectedList.map((r) => `• ${r.title}: ${r.reason}`).join("\n"),
              { duration: 15_000 }
            );
          } else {
            toast.success(data.desktopStatus ?? "Пакет создан");
          }
        } else if (data.debugOtp && data.debugSignUrl) {
          toast.success(
            `Тест: код ${data.debugOtp}. Ссылка в консоли (SMS не настроен).`,
            { duration: 15_000 }
          );
          console.info("[document-sign]", data.debugSignUrl);
        } else if (data.provider === "fdoc") {
          toast.success("Пакет отправлен в F.Doc — пациенту уйдёт SMS от F.Doc");
        } else {
          toast.success("SMS со ссылкой и кодом отправлено пациенту");
        }
        setConfirmSignOpen(false);
        onDone();
        onOpenChange(false);
      } catch {
        toast.error("Ошибка сети");
      } finally {
        setSignSending(false);
      }
    })();
  };

  const filteredContracts = useMemo(
    () => filterArrivalDocuments(contracts, docSearch),
    [contracts, docSearch]
  );
  const filteredConsents = useMemo(
    () => filterArrivalDocuments(consents, docSearch),
    [consents, docSearch]
  );
  const filteredHealthCards = useMemo(
    () => filterArrivalDocuments(healthCards, docSearch),
    [healthCards, docSearch]
  );
  const filteredEgiszRefusals = useMemo(
    () => filterArrivalDocuments(egiszRefusals, docSearch),
    [egiszRefusals, docSearch]
  );

  const searchActive = docSearch.trim().length > 0;

  const toggle = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleEgiszChoice = (value: "yes" | "no") => {
    setSendToEgisz(value);
    if (value === "no") {
      setSelectedEgiszRefusals(egiszRefusals.map((d) => d.id));
    }
  };

  const handleAddToLegal = () => {
    if (!newDocName.trim()) {
      toast.error("Укажите название документа");
      return;
    }
    const doc: LegalDocument = {
      id: generateId("legal"),
      title: newDocName.trim(),
      category: newDocCategory,
      date: format(new Date(), "yyyy-MM-dd"),
      fileDataUrl: pendingFile?.dataUrl,
      fileName: pendingFile?.name,
    };
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await upsertLegalDocumentViaCommandApi(doc);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось сохранить документ на сервере");
          return;
        }
        runWithoutClinicFlush(() => addLegalDocument(doc));
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        setNewDocName("");
        setPendingFile(null);
        toast.success("Документ добавлен в юр. отдел");
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  const attachFileToDoc = useCallback(
    async (docId: string, file: File) => {
      const current = useClinicStore.getState().legalDocuments.find((d) => d.id === docId);
      if (!current) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const next: LegalDocument = {
          ...current,
          fileDataUrl: dataUrl,
          fileName: file.name,
        };
        beginClinicCommandMutation();
        try {
          const api = await upsertLegalDocumentViaCommandApi(next);
          if (!api.ok) {
            toast.error(api.error ?? "Не удалось сохранить файл на сервере");
            return;
          }
          runWithoutClinicFlush(() =>
            updateLegalDocument(docId, { fileDataUrl: dataUrl, fileName: file.name })
          );
          markClinicSyncedAfterCommand(api.updatedAt, api.revision);
          useClinicStore.getState().pauseClinicAutoSave(15_000);
          notifyClinicDataChanged();
          toast.success("Файл прикреплён");
        } finally {
          endClinicCommandMutation();
        }
      } catch {
        toast.error("Поддерживаются только PDF и изображения (PNG, JPEG, WebP)");
      }
    },
    [updateLegalDocument]
  );

  const persistEgiszConsent = useCallback(async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}/consents`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentType: "egisz_transfer",
          granted: sendToEgisz === "yes",
          notes:
            sendToEgisz === "yes"
              ? "Согласие при визите (документы при статусе «Пришёл»)"
              : "Отказ при визите (документы при статусе «Пришёл»)",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.warning(data.error ?? "Решение по ЕГИСЗ не сохранено в системе");
        return false;
      }
      return true;
    } catch {
      toast.warning("Решение по ЕГИСЗ не сохранено — проверьте сеть");
      return false;
    }
  }, [patientId, sendToEgisz]);

  const handlePrint = () => {
    if (!patient) {
      toast.error("Пациент не найден — обновите страницу");
      return;
    }

    const toPrint: ArrivalPrintDocument[] = collectSelectedDocuments();

    if (toPrint.length === 0) {
      toast.error("Выберите документы для печати");
      return;
    }

    const ctx = {
      patient,
      clinic: clinicSettings,
      doctor,
      appointmentDate,
    };

    const pdfDocs = toPrint.filter((d) => isPdfArrivalDocument(d));
    const docxDocs = toPrint.filter((d) => isDocxArrivalDocument(d));
    const imageDocs = toPrint.filter(
      (d) =>
        d.fileDataUrl?.startsWith("data:image/") &&
        !isPdfArrivalDocument(d) &&
        !isDocxArrivalDocument(d)
    );
    const htmlDocs = toPrint.filter(
      (d) =>
        !isPdfArrivalDocument(d) &&
        !isDocxArrivalDocument(d) &&
        !d.fileDataUrl?.startsWith("data:image/")
    );

    const needsPdfTab = pdfDocs.length > 0;
    const needsHtmlTab =
      docxDocs.length > 0 || imageDocs.length > 0 || htmlDocs.length > 0;

    // Максимум 2 вкладки — иначе браузер блокирует popup и/или второй print()
    const pdfTab = needsPdfTab ? reserveBrowserTab() : null;
    const htmlTab = needsHtmlTab ? reserveBrowserTab() : null;
    if (pdfTab) showTabLoading(pdfTab, "Подготовка PDF…");
    if (htmlTab) showTabLoading(htmlTab, "Подготовка документов…");

    const loadingId = toast.loading("Подготовка документов…");

    void (async () => {
      let preparedDocs = 0;
      let openedJobs = 0;

      try {
        const pdfParts: Uint8Array[] = [];
        for (const doc of pdfDocs) {
          const dataUrl = await resolveArrivalDocumentDataUrl(doc);
          if (!dataUrl) {
            toast.warning(`${doc.name}: файл не прикреплён`);
            continue;
          }
          const result = await fillLegalPdf(dataUrl, ctx);
          if (!result.ok) {
            toast.error(`${doc.name}: ${result.error}`, { duration: 12_000 });
            if (result.fieldNames?.length) {
              console.info("[legal-pdf] поля:", result.fieldNames.join(", "));
            }
            continue;
          }
          pdfParts.push(result.bytes);
          preparedDocs++;
          if (result.passthrough) {
            toast.info(
              `${doc.name}: без автозаполнения (в PDF нет полей формы)`,
              { duration: 8_000 }
            );
          } else if (result.unmatchedFields.length > 0) {
            toast.warning(
              `${doc.name}: заполнено ${result.filledCount} из ${result.fieldCount} полей`
            );
          }
        }

        if (pdfParts.length > 0) {
          const merged =
            pdfParts.length === 1
              ? pdfParts[0]
              : await mergePdfByteArrays(pdfParts);
          if (
            printPdfBytesInTab(
              pdfTab,
              merged,
              pdfParts.length === 1
                ? (pdfDocs[0]?.fileName ?? "document.pdf")
                : "documents.pdf",
              { autoPrint: true }
            )
          ) {
            openedJobs++;
          }
        } else {
          closeBrowserTab(pdfTab);
        }

        const htmlSections: { title: string; bodyHtml: string }[] = [];

        for (const doc of docxDocs) {
          const dataUrl = await resolveArrivalDocumentDataUrl(doc);
          if (!dataUrl) {
            toast.warning(`${doc.name}: файл не прикреплён`);
            continue;
          }
          const result = await fillLegalDocxToPrintHtml(
            dataUrl,
            ctx,
            doc.fileName ?? doc.name
          );
          if (!result.ok) {
            toast.error(`${doc.name}: ${result.error}`, { duration: 12_000 });
            continue;
          }
          htmlSections.push({ title: doc.name, bodyHtml: result.bodyHtml });
          preparedDocs++;
          if (result.filledCount < result.placeholderCount) {
            toast.warning(
              `${doc.name}: подставлено ${result.filledCount} из ${result.placeholderCount} плейсхолдеров`
            );
          }
        }

        for (const doc of imageDocs) {
          if (!doc.fileDataUrl) {
            toast.warning(`${doc.name}: изображение не открывается`);
            continue;
          }
          const parsed = parseAllowedDataUrl(doc.fileDataUrl);
          if (!parsed || parsed.kind === "pdf") {
            toast.warning(`${doc.name}: изображение не открывается`);
            continue;
          }
          htmlSections.push({
            title: doc.name,
            bodyHtml: `<img src="${parsed.dataUrl.replace(/"/g, "&quot;")}" alt="" style="max-width:100%" />`,
          });
          preparedDocs++;
        }

        if (htmlDocs.length > 0) {
          const bundle = buildArrivalDocumentsPrintHtml({
            documents: htmlDocs,
            ctx,
            sendToEgisz,
          });
          const bodyMatch = bundle.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          const inner = (bodyMatch?.[1] ?? bundle)
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .trim();
          htmlSections.push({
            title: htmlDocs.length === 1 ? htmlDocs[0].name : "Формы без файла",
            bodyHtml: inner,
          });
          preparedDocs += htmlDocs.length;
        }

        if (htmlSections.length > 0) {
          const autoPrint = openedJobs === 0;
          const combined = wrapCombinedLegalPrintHtml(
            htmlSections,
            htmlSections.length === 1 ? htmlSections[0].title : "Комплект документов",
            { autoPrint }
          );
          if (printHtmlDocumentInTab(htmlTab, combined, { autoPrint })) {
            openedJobs++;
            if (!autoPrint) {
              toast.info(
                "Открыта вторая вкладка (HTML) — нажмите Ctrl+P / Cmd+P для печати",
                { duration: 12_000 }
              );
            }
          }
        } else {
          closeBrowserTab(htmlTab);
        }

        if (openedJobs === 0) {
          toast.error("Не удалось подготовить документы к печати", { id: loadingId });
          return;
        }

        toast.success(
          preparedDocs > 1
            ? `Готово к печати: ${preparedDocs} документов в ${openedJobs} ${openedJobs === 1 ? "окне" : "окнах"}`
            : "Документ отправлен на печать",
          { id: loadingId }
        );
        await persistEgiszConsent();
        onDone();
        onOpenChange(false);
      } catch {
        closeBrowserTab(pdfTab);
        closeBrowserTab(htmlTab);
        toast.error("Ошибка при подготовке документов", { id: loadingId });
      }
    })();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Пациент пришёл — документы</DialogTitle>
      </DialogHeader>
      {patient && patientTokens ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--callout-neutral-bg)] p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Пациент
            </p>
            <p className="mt-1 font-medium text-[var(--foreground)]">
              {patientTokens["patient.fullName"]}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {patientTokens["patient.birthDate"]} · {patientTokens["patient.phone"]}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Договор № {patientTokens["patient.contractNumber"]} · визит {patientTokens["appointment.date"]}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--callout-neutral-bg)] p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Клиника
            </p>
            <p className="mt-1 font-medium text-[var(--foreground)]">
              {patientTokens["clinic.name"]}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{patientTokens["clinic.address"]}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              ИНН {patientTokens["clinic.inn"]} · {patientTokens["clinic.phone"]}
            </p>
            {patientTokens["doctor.name"] !== "—" && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Врач: {patientTokens["doctor.name"]}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-red-600">Пациент не найден в базе клиники</p>
      )}
      <p className="text-sm text-[var(--muted)]">
        Договоры, согласия и карточка здоровья подставляются из шаблонов{" "}
        <strong>Юр. отдела</strong> при печати с визита.
      </p>

      <p className="text-sm text-[var(--muted)]">
        При отказе от ЕГИСЗ — стандартная форма или документы из «{LEGAL_CATEGORY_EGISZ_REFUSAL}».
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <Input
          value={docSearch}
          onChange={(e) => setDocSearch(e.target.value)}
          placeholder="Поиск по названию документа…"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DocList
          title={`Договоры (${LEGAL_CATEGORY_CONTRACTS})`}
          items={filteredContracts}
          totalCount={contracts.length}
          selected={selectedContracts}
          onToggle={(id) => toggle(id, selectedContracts, setSelectedContracts)}
          emptyHint={`Добавьте документы в юр. отдел → «${LEGAL_CATEGORY_CONTRACTS}»`}
          noSearchResultsHint={
            searchActive ? "Нет договоров по этому запросу" : undefined
          }
          onAttachFile={attachFileToDoc}
        />
        <DocList
          title={`Согласия (${LEGAL_CATEGORY_CONSENTS})`}
          items={filteredConsents}
          totalCount={consents.length}
          selected={selectedConsents}
          onToggle={(id) => toggle(id, selectedConsents, setSelectedConsents)}
          emptyHint={`Добавьте документы в юр. отдел → «${LEGAL_CATEGORY_CONSENTS}»`}
          noSearchResultsHint={
            searchActive ? "Нет согласий по этому запросу" : undefined
          }
          onAttachFile={attachFileToDoc}
        />
        <DocList
          title={`Карточка здоровья (${LEGAL_CATEGORY_HEALTH_CARD})`}
          items={filteredHealthCards}
          totalCount={healthCards.length}
          selected={selectedHealthCards}
          onToggle={(id) => toggle(id, selectedHealthCards, setSelectedHealthCards)}
          emptyHint={`Добавьте бланк в юр. отдел → «${LEGAL_CATEGORY_HEALTH_CARD}»`}
          noSearchResultsHint={
            searchActive ? "Нет карточек здоровья по этому запросу" : undefined
          }
          onAttachFile={attachFileToDoc}
        />
      </div>

      <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
        <Label>Отправка данных в ЕГИСЗ</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <input
              type="radio"
              checked={sendToEgisz === "yes"}
              onChange={() => handleEgiszChoice("yes")}
            />
            Да, отправить
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <input
              type="radio"
              checked={sendToEgisz === "no"}
              onChange={() => handleEgiszChoice("no")}
            />
            Нет — печать отказа (стандартная форма)
          </label>
        </div>

        {sendToEgisz === "no" && egiszRefusals.length > 0 && (
          <div className="mt-2 border-t border-[var(--border)] pt-3">
            <DocList
              title={`${LEGAL_CATEGORY_EGISZ_REFUSAL} (необязательно)`}
              items={filteredEgiszRefusals}
              totalCount={egiszRefusals.length}
              selected={selectedEgiszRefusals}
              onToggle={(id) => toggle(id, selectedEgiszRefusals, setSelectedEgiszRefusals)}
              emptyHint=""
              noSearchResultsHint={
                searchActive ? "Нет форм отказа по этому запросу" : undefined
              }
              onAttachFile={attachFileToDoc}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Если ничего не выбрано — будет напечатана встроенная форма отказа.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-[var(--callout-neutral-bg)] p-3 space-y-3">
        <Label className="text-xs font-semibold">
          Быстро добавить в юр. отдел (договор, согласие или карточка здоровья)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2 text-sm text-[var(--foreground)]"
            value={newDocCategory}
            onChange={(e) =>
              setNewDocCategory(
                e.target.value as
                  | typeof LEGAL_CATEGORY_CONTRACTS
                  | typeof LEGAL_CATEGORY_CONSENTS
                  | typeof LEGAL_CATEGORY_HEALTH_CARD
              )
            }
          >
            <option value={LEGAL_CATEGORY_CONTRACTS}>{LEGAL_CATEGORY_CONTRACTS}</option>
            <option value={LEGAL_CATEGORY_CONSENTS}>{LEGAL_CATEGORY_CONSENTS}</option>
            <option value={LEGAL_CATEGORY_HEALTH_CARD}>{LEGAL_CATEGORY_HEALTH_CARD}</option>
          </select>
          <Input
            placeholder="Название документа"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] hover:border-teal-400">
            <Upload className="h-4 w-4" />
            {pendingFile ? pendingFile.name : "Файл (PDF, фото)"}
            <input
              type="file"
              accept=".pdf,image/*,.doc,.docx"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const dataUrl = await readFileAsDataUrl(file);
                  setPendingFile({ dataUrl, name: file.name });
                } catch {
                  toast.error("Поддерживаются только PDF и изображения (PNG, JPEG, WebP)");
                }
              }}
            />
          </label>
          <Button type="button" onClick={handleAddToLegal}>
            <Plus className="h-4 w-4" />
            В юр. отдел
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <ModuleGate module="document_sign">
          <Button
            type="button"
            variant="outline"
            disabled={signSending || (signProvider === "emkaro_sign" && !signReady)}
            title={
              signProvider === "emkaro_sign" && !signReady
                ? "Emkaro Sign не настроен или клиника не привязана"
                : undefined
            }
            onClick={handleSignBySms}
          >
            <MessageSquare className="h-4 w-4" />
            {signSending ? "Отправка…" : signButtonLabel}
          </Button>
        </ModuleGate>
        <Button onClick={handlePrint}>Печать выбранных</Button>
      </div>
      {desktopSignStatus && (
        <p className="text-xs text-[var(--muted)]">{desktopSignStatus}</p>
      )}
      {patient && (
        <SendToSignConfirmDialog
          open={confirmSignOpen}
          onOpenChange={setConfirmSignOpen}
          patientName={formatPatientDisplayName(patient)}
          patientPhone={patient.phone}
          documentNames={collectSelectedDocuments().map((d) => d.name)}
          busy={signSending}
          onConfirm={() => executeSignSend(collectSelectedDocuments())}
        />
      )}
    </>
  );
}

export function AppointmentDocumentsModal({
  open,
  onOpenChange,
  onDone,
  patientId,
  doctorId,
  appointmentDate,
}: AppointmentDocumentsModalProps) {
  const legalEnabled = useIsModuleEnabled("legal");

  useEffect(() => {
    if (!legalEnabled && open) onOpenChange(false);
  }, [legalEnabled, open, onOpenChange]);

  if (!legalEnabled) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {open ? (
          <AppointmentDocumentsModalBody
            key={`appointment-documents-${patientId}`}
            onDone={onDone}
            onOpenChange={onOpenChange}
            patientId={patientId}
            doctorId={doctorId}
            appointmentDate={appointmentDate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
