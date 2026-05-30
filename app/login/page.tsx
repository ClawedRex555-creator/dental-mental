"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { APP_LOGO_TEXT, APP_NAME, ROLE_LABELS } from "@/lib/constants";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { DEMO_LOGIN_HINTS } from "@/lib/demo-login-hints";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSessionUser = useClinicStore((s) => s.setSessionUser);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [clinicSlug, setClinicSlug] = useState<string | null>(null);
  const [clinicError, setClinicError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clinic/context", { credentials: "same-origin" })
      .then(async (res) => {
        const data = await res.json();
        if (data.mode === "platform") {
          setClinicError("platform");
          return;
        }
        if (!res.ok) {
          setClinicError(data.error ?? "Клиника не найдена");
          return;
        }
        setClinicName(data.name);
        setClinicSlug(data.slug);
      })
      .catch(() => setClinicError("Не удалось определить клинику"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Ошибка входа");
        return;
      }
      setSessionUser(data.user);
      toast.success(`Добро пожаловать, ${data.user.name}`);
      router.replace(safeRedirectPath(searchParams.get("from")));
      router.refresh();
    } catch {
      toast.error("Не удалось выполнить вход");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            {APP_LOGO_TEXT}
          </div>
          <CardTitle className="text-xl">{APP_NAME}</CardTitle>
          {clinicName && clinicSlug && (
            <p className="text-sm font-medium text-teal-800">
              {clinicName}
              <span className="mt-1 block font-mono text-xs text-slate-500">{clinicSlug}</span>
            </p>
          )}
          {!clinicName && !clinicError && (
            <p className="text-sm text-[var(--muted)]">Загрузка…</p>
          )}
          {clinicError === "platform" && (
            <p className="text-sm text-amber-700">
              Вход через поддомен клиники, например <strong>ulybka.ваш-домен.ru</strong>
            </p>
          )}
          {clinicError && clinicError !== "platform" && (
            <p className="text-sm text-red-600">{clinicError}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">Email для входа</Label>
              <Input
                id="login"
                type="email"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="doctor@clinic.ru"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || clinicError !== null || !clinicSlug}
            >
              {loading ? "Вход…" : "Войти"}
            </Button>
          </form>

          {process.env.NODE_ENV === "development" && (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="mb-2 font-medium text-slate-700">Демо-учётки (только dev, пароль: роль + 123)</p>
            <ul className="space-y-1">
              {DEMO_LOGIN_HINTS.map((h) => (
                <li key={h.login}>
                  <button
                    type="button"
                    className="text-left text-teal-700 hover:underline"
                    onClick={() => {
                      setLogin(h.login);
                      setPassword(h.passwordHint);
                    }}
                  >
                    {h.login}
                  </button>
                  <span className="text-slate-500"> — {ROLE_LABELS[h.role]}</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
