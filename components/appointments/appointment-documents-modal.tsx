"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import {
  LEGAL_CATEGORY_CONSENTS,
  LEGAL_CATEGORY_CONTRACTS,
  LEGAL_CATEGORY_EGISZ_REFUSAL,
  arrivalDocumentsFromLegal,
  type ArrivalPrintDocument,
} from "@/lib/legal-categories";
import { openStoredFile } from "@/lib/open-stored-file";
import { useClinicStore } from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
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
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AppointmentDocumentsModal({
  open,
  onOpenChange,
  onDone,
}: AppointmentDocumentsModalProps) {
  const { legalDocuments, addLegalDocument, updateLegalDocument } = useClinicStore();

  const { contracts, consents, egiszRefusals } = useMemo(
    () => arrivalDocumentsFromLegal(legalDocuments),
    [legalDocuments]
  );

  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);
  const [selectedEgiszRefusals, setSelectedEgiszRefusals] = useState<string[]>([]);
  const [sendToEgisz, setSendToEgisz] = useState<"yes" | "no">("yes");
  const [newDocName, setNewDocName] = useState("");
  const [newDocCategory, setNewDocCategory] = useState<
    typeof LEGAL_CATEGORY_CONTRACTS | typeof LEGAL_CATEGORY_CONSENTS
  >(LEGAL_CATEGORY_CONTRACTS);
  const [pendingFile, setPendingFile] = useState<{ dataUrl: string; name: string } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    setSelectedContracts(contracts.map((c) => c.id));
    setSelectedConsents(consents.map((c) => c.id));
    setSelectedEgiszRefusals(egiszRefusals.map((c) => c.id));
    setSendToEgisz("yes");
    setPendingFile(null);
  }, [open, contracts, consents, egiszRefusals]);

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
    addLegalDocument({
      id: generateId("legal"),
      title: newDocName.trim(),
      category: newDocCategory,
      date: format(new Date(), "yyyy-MM-dd"),
      fileDataUrl: pendingFile?.dataUrl,
      fileName: pendingFile?.name,
    });
    setNewDocName("");
    setPendingFile(null);
    toast.success("Документ добавлен в юр. отдел");
  };

  const attachFileToDoc = async (docId: string, file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    updateLegalDocument(docId, { fileDataUrl: dataUrl, fileName: file.name });
    toast.success("Файл прикреплён");
  };

  const handlePrint = () => {
    const toPrint: ArrivalPrintDocument[] = [];

    contracts.forEach((d) => {
      if (selectedContracts.includes(d.id)) toPrint.push(d);
    });
    consents.forEach((d) => {
      if (selectedConsents.includes(d.id)) toPrint.push(d);
    });
    if (sendToEgisz === "no") {
      if (egiszRefusals.length === 0) {
        toast.error(
          `Добавьте документ в юр. отдел → категория «${LEGAL_CATEGORY_EGISZ_REFUSAL}»`
        );
        return;
      }
      egiszRefusals.forEach((d) => {
        if (selectedEgiszRefusals.includes(d.id)) toPrint.push(d);
      });
      if (toPrint.filter((d) => d.kind === "egisz_refusal").length === 0) {
        toast.error("Выберите хотя бы один документ отказа от ЕГИСЗ");
        return;
      }
    }

    if (toPrint.length === 0) {
      toast.error("Выберите документы для печати");
      return;
    }

    const withFiles = toPrint.filter((d) => d.fileDataUrl);
    const withoutFiles = toPrint.filter((d) => !d.fileDataUrl);

    withFiles.forEach((d) => {
      openStoredFile(d.fileDataUrl, d.fileName ?? d.name);
    });

    if (withoutFiles.length > 0 || toPrint.length === withFiles.length) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Документы</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-top:24px}p{color:#444;font-size:12px}.file-note{color:teal}</style></head><body>
      <h1>Комплект документов</h1>
      <p>ЕГИСЗ: ${
        sendToEgisz === "yes"
          ? "отправить данные"
          : "отказ — печать формы из юр. отдела"
      }</p>
      ${toPrint
        .map((d) => {
          if (d.fileDataUrl) {
            return `<h2>${d.name}</h2><p class="file-note">Файл «${d.fileName ?? "документ"}» открыт в отдельной вкладке</p>`;
          }
          return `<h2>${d.name}</h2>${d.notes ? `<p>${d.notes}</p>` : ""}<p style="margin:48px 0;border-top:1px solid #ccc">Подпись _________________ Дата _______</p>`;
        })
        .join("")}
      ${withoutFiles.length > 0 ? "<script>window.onload=()=>window.print()</script>" : ""}
      </body></html>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    }

    toast.success(`Выбрано: ${toPrint.length} (${withFiles.length} с файлом)`);
    onDone();
    onOpenChange(false);
  };

  const DocList = ({
    title,
    items,
    selected,
    onToggle,
    emptyHint,
  }: {
    title: string;
    items: ArrivalPrintDocument[];
    selected: string[];
    onToggle: (id: string) => void;
    emptyHint: string;
  }) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {items.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">{emptyHint}</p>
        ) : (
          items.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-2 rounded p-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                {doc.notes && <p className="text-xs text-slate-500">{doc.notes}</p>}
                {doc.fileName && (
                  <p className="text-xs text-teal-700">Файл: {doc.fileName}</p>
                )}
              </div>
              <label className="cursor-pointer rounded border border-slate-200 p-1 hover:bg-slate-100">
                <Upload className="h-3.5 w-3.5 text-slate-600" />
                <input
                  type="file"
                  accept=".pdf,image/*,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) attachFileToDoc(doc.id, file);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Пациент пришёл — документы</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Документы подгружаются из{" "}
          <span className="font-medium text-slate-700">Юр. отдела</span>: договоры и согласия — из
          соответствующих категорий. При отказе от ЕГИСЗ — из категории «
          {LEGAL_CATEGORY_EGISZ_REFUSAL}».
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <DocList
            title={`Договоры (${LEGAL_CATEGORY_CONTRACTS})`}
            items={contracts}
            selected={selectedContracts}
            onToggle={(id) => toggle(id, selectedContracts, setSelectedContracts)}
            emptyHint={`Добавьте документы в юр. отдел → «${LEGAL_CATEGORY_CONTRACTS}»`}
          />
          <DocList
            title={`Согласия (${LEGAL_CATEGORY_CONSENTS})`}
            items={consents}
            selected={selectedConsents}
            onToggle={(id) => toggle(id, selectedConsents, setSelectedConsents)}
            emptyHint={`Добавьте документы в юр. отдел → «${LEGAL_CATEGORY_CONSENTS}»`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <Label>Отправка данных в ЕГИСЗ</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                checked={sendToEgisz === "yes"}
                onChange={() => handleEgiszChoice("yes")}
              />
              Да, отправить
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                checked={sendToEgisz === "no"}
                onChange={() => handleEgiszChoice("no")}
              />
              Нет — печать отказа из юр. отдела
            </label>
          </div>

          {sendToEgisz === "no" && (
            <div className="mt-2 border-t border-slate-100 pt-3">
              <DocList
                title={LEGAL_CATEGORY_EGISZ_REFUSAL}
                items={egiszRefusals}
                selected={selectedEgiszRefusals}
                onToggle={(id) =>
                  toggle(id, selectedEgiszRefusals, setSelectedEgiszRefusals)
                }
                emptyHint={`Загрузите форму отказа в юр. отдел → «${LEGAL_CATEGORY_EGISZ_REFUSAL}»`}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 p-3 space-y-3">
          <Label className="text-xs font-semibold">
            Быстро добавить в юр. отдел (договор или согласие)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-900"
              value={newDocCategory}
              onChange={(e) =>
                setNewDocCategory(
                  e.target.value as typeof LEGAL_CATEGORY_CONTRACTS | typeof LEGAL_CATEGORY_CONSENTS
                )
              }
            >
              <option value={LEGAL_CATEGORY_CONTRACTS}>{LEGAL_CATEGORY_CONTRACTS}</option>
              <option value={LEGAL_CATEGORY_CONSENTS}>{LEGAL_CATEGORY_CONSENTS}</option>
            </select>
            <Input
              placeholder="Название документа"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm hover:border-teal-400">
              <Upload className="h-4 w-4" />
              {pendingFile ? pendingFile.name : "Файл (PDF, фото)"}
              <input
                type="file"
                accept=".pdf,image/*,.doc,.docx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const dataUrl = await readFileAsDataUrl(file);
                  setPendingFile({ dataUrl, name: file.name });
                }}
              />
            </label>
            <Button type="button" onClick={handleAddToLegal}>
              <Plus className="h-4 w-4" />
              В юр. отдел
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handlePrint}>Печать / открыть выбранные</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
