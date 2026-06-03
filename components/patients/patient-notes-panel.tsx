"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  MessageSquarePlus,
  Pin,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Patient, PatientNote, PatientNoteCategory } from "@/lib/types";
import { PATIENT_NOTE_CATEGORIES, ROLE_LABELS } from "@/lib/constants";
import { useClinicStore } from "@/store/useClinicStore";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { logAuditClient } from "@/lib/audit-client";
import { isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { format } from "date-fns";

const CATEGORY_ICONS: Record<PatientNoteCategory, typeof Pin> = {
  general: MessageSquarePlus,
  reception: UserRound,
  clinical: Stethoscope,
  billing: Banknote,
};

const CATEGORY_STYLES: Record<PatientNoteCategory, string> = {
  general: "bg-slate-100 text-slate-700 border-slate-200",
  reception: "bg-sky-50 text-sky-800 border-sky-200",
  clinical: "bg-teal-50 text-teal-800 border-teal-200",
  billing: "bg-amber-50 text-amber-900 border-amber-200",
};

function noteCategory(note: PatientNote): PatientNoteCategory {
  return note.category ?? "general";
}

function groupLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Сегодня";
  if (isYesterday(d)) return "Вчера";
  return format(d, "d MMMM yyyy", { locale: ru });
}

function canManageNote(
  note: PatientNote,
  userId: string,
  userRole: PatientNote["role"]
): boolean {
  if (note.authorId && note.authorId === userId) return true;
  if (!note.authorId) return true;
  return userRole === "owner" || userRole === "admin";
}

export function PatientNotesPanel({
  patient,
  notes,
}: {
  patient: Patient;
  notes: PatientNote[];
}) {
  const {
    currentUser,
    addPatientNote,
    deletePatientNote,
    updatePatient,
  } = useClinicStore();

  const [category, setCategory] = useState<PatientNoteCategory>("general");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<PatientNoteCategory | "all">("all");
  const [pinnedDraft, setPinnedDraft] = useState(patient.notes ?? "");
  const [pinnedDirty, setPinnedDirty] = useState(false);

  useEffect(() => {
    setPinnedDraft(patient.notes ?? "");
    setPinnedDirty(false);
  }, [patient.id, patient.notes]);

  const sorted = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notes]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return sorted;
    return sorted.filter((n) => noteCategory(n) === filter);
  }, [sorted, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PatientNote[]>();
    for (const note of filtered) {
      const key = groupLabel(note.createdAt);
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const categoryHint =
    PATIENT_NOTE_CATEGORIES.find((c) => c.id === category)?.hint ?? "";

  function submitNote() {
    const text = draft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const note: PatientNote = {
      id: `pn_${Date.now()}`,
      patientId: patient.id,
      author: currentUser.name || "Сотрудник",
      authorId: currentUser.id,
      role: currentUser.role,
      text,
      category,
      createdAt: now,
    };
    addPatientNote(note);
    logAuditClient({
      action: "create",
      resourceType: "patient",
      resourceId: patient.id,
      metadata: { noteId: note.id, category, kind: "team_note" },
    });
    setDraft("");
  }

  function savePinned() {
    updatePatient(patient.id, { notes: pinnedDraft.trim() || undefined });
    setPinnedDirty(false);
    logAuditClient({
      action: "update",
      resourceType: "patient",
      resourceId: patient.id,
      metadata: { field: "pinned_notes" },
    });
  }

  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitNote();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Pin className="h-4 w-4 text-amber-700" />
            Важно для всей команды
          </CardTitle>
          <p className="text-xs text-slate-600">
            Закреплённая заметка — видна в обзоре карточки. Аллергии и диагноз хранятся в разделе «Здоровье».
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={pinnedDraft}
            onChange={(e) => {
              setPinnedDraft(e.target.value);
              setPinnedDirty(true);
            }}
            placeholder="Например: боится анестезии, просит звонить за день, только утренние записи…"
            className="min-h-[72px] bg-white"
          />
          {pinnedDirty && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPinnedDraft(patient.notes ?? "");
                  setPinnedDirty(false);
                }}
              >
                Отмена
              </Button>
              <Button type="button" size="sm" onClick={savePinned}>
                Сохранить
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Новая заметка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PATIENT_NOTE_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICONS[c.id];
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? CATEGORY_STYLES[c.id]
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{categoryHint}</p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder="Что важно зафиксировать для коллег?"
            className="min-h-[88px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Ctrl+Enter — отправить</span>
            <Button type="button" size="sm" onClick={submitNote} disabled={!draft.trim()}>
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          </div>
        </CardContent>
      </Card>

      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              filter === "all"
                ? "bg-teal-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            Все ({sorted.length})
          </button>
          {PATIENT_NOTE_CATEGORIES.map((c) => {
            const count = sorted.filter((n) => noteCategory(n) === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  filter === c.id
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {c.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            {sorted.length === 0
              ? "Заметок пока нет — добавьте первую для команды"
              : "В этой категории заметок нет"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayNotes]) => (
            <div key={day}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {day}
              </p>
              <ul className="space-y-3">
                {dayNotes.map((note) => {
                  const cat = noteCategory(note);
                  const Icon = CATEGORY_ICONS[cat];
                  const catMeta = PATIENT_NOTE_CATEGORIES.find((c) => c.id === cat);
                  const manageable = canManageNote(
                    note,
                    currentUser.id,
                    currentUser.role
                  );
                  return (
                    <li
                      key={note.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                              CATEGORY_STYLES[cat]
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {catMeta?.label}
                          </span>
                          <span className="text-sm font-medium text-slate-900">
                            {note.author}
                          </span>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {ROLE_LABELS[note.role]}
                          </Badge>
                          {note.sourceTreatmentPlanId && (
                            <Badge
                              variant="outline"
                              className="border-teal-200 bg-teal-50/80 text-[10px] font-normal text-teal-800"
                            >
                              План лечения
                            </Badge>
                          )}
                        </div>
                        <time className="text-xs text-slate-400">
                          {formatDateTime(note.createdAt)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">
                        {note.text}
                      </p>
                      {manageable && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              if (
                                !window.confirm("Удалить эту заметку?")
                              ) {
                                return;
                              }
                              deletePatientNote(note.id);
                              logAuditClient({
                                action: "delete",
                                resourceType: "patient",
                                resourceId: patient.id,
                                metadata: { noteId: note.id, kind: "team_note" },
                              });
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Удалить
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
