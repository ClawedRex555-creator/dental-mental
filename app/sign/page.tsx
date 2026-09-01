"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import type { DocumentSignPublicView } from "@/lib/document-sign/types";

function useSignToken(): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("t")?.trim() ?? null;
  }, []);
}

export default function SignPage() {
  const token = useSignToken();
  const [view, setView] = useState<DocumentSignPublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("Неверная ссылка");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-sign/public?token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as DocumentSignPublicView & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось загрузить документы");
        setView(null);
        return;
      }
      setView(data);
      if (data.status === "signed") {
        setSignedAt(data.signedAt ?? new Date().toISOString());
      }
    } catch {
      setError("Ошибка сети. Проверьте подключение к интернету.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || code.replace(/\D/g, "").length < 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/document-sign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: code.replace(/\D/g, "") }),
      });
      const data = (await res.json()) as { ok?: boolean; signedAt?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось подписать");
        return;
      }
      setSignedAt(data.signedAt ?? new Date().toISOString());
      void load();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  };

  const isSigned = Boolean(signedAt) || view?.status === "signed";

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-8">
      <header className="mb-6 text-center">
        <p className="text-sm text-[var(--muted)]">Электронная подпись документов</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {view?.clinicName ?? "Клиника"}
        </h1>
      </header>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--muted)]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Загрузка…</p>
        </div>
      ) : error && !view ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : view ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <p className="text-sm text-[var(--muted)]">Пациент</p>
            <p className="font-medium">{view.patientName}</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium">Документы для подписи</p>
            <ul className="space-y-2">
              {view.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-start gap-2 text-sm text-[var(--foreground)]"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                  <span>{doc.name}</span>
                </li>
              ))}
            </ul>
          </div>

          {isSigned ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-teal-600" />
              <p className="font-semibold text-teal-900">Документы подписаны</p>
              <p className="text-sm text-teal-800">
                {view.provider === "fdoc"
                  ? "Подпись зафиксирована через F.Doc."
                  : "Простая электронная подпись (ПЭП) подтверждена кодом из SMS."}
              </p>
            </div>
          ) : view.provider === "fdoc" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {view.signingHint ??
                "Откройте ссылку из SMS от F.Doc и введите код для подписи документов."}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Введите код из SMS и нажмите «Подписать». Нажимая кнопку, вы подтверждаете
                ознакомление с перечисленными документами и согласие с их содержанием простой
                электронной подписью (63-ФЗ).
              </p>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Код из SMS</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-4 text-center text-2xl tracking-[0.3em] text-[var(--foreground)]"
                  placeholder="000000"
                />
              </label>
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting || code.length < 6}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-teal-600 text-base font-medium text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Подписать"}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
