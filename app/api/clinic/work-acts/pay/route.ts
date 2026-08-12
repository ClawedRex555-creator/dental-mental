import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { asClinicBoundSession } from "@/lib/clinic-bound-session";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { applyPayWorkActToPersistedState } from "@/lib/apply-pay-work-act";
import { canWriteClinicDataSync } from "@/lib/clinic-data-access";
import {
  ClinicRevisionConflictError,
  getClinicDataDbWithLegacyStaff,
  PatientMassLossGuardError,
  ScheduleMassLossGuardError,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import type { PaymentMethod } from "@/lib/types";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, must-revalidate",
  Vary: "Cookie",
};

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "installment"];

/**
 * Command API: оплата акта без полного client PUT snapshot.
 * Идемпотентность через детерминированный paymentId.
 */
export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Запрос отклонён" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json(
      { ok: false, error: "База данных недоступна" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const store = await cookies();
  const session = asClinicBoundSession(verifySessionToken(store.get(AUTH_COOKIE)?.value));
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
  const role = authUser?.role ?? session.role;
  if (!authUser || !canWriteClinicDataSync(role)) {
    return NextResponse.json(
      { ok: false, error: "Нет прав на оплату" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  if (role === "doctor") {
    return NextResponse.json(
      { ok: false, error: "Оплата доступна администратору или владельцу" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let body: {
    actId?: unknown;
    method?: unknown;
    amount?: unknown;
    expectedUpdatedAt?: unknown;
    expectedRevision?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Неверный запрос" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actId = typeof body.actId === "string" ? body.actId.trim() : "";
  if (!actId) {
    return NextResponse.json(
      { ok: false, error: "Не указан акт" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const method =
    typeof body.method === "string" && METHODS.includes(body.method as PaymentMethod)
      ? (body.method as PaymentMethod)
      : "cash";
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount)
      ? body.amount
      : undefined;
  // Как appointment commands: без autoMerge (он откатывает изменения при stale CAS),
  // load→apply→CAS от свежей строки→retry.
  const maxAttempts = 3;
  let lastConflictUpdatedAt: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
    if (!existing?.data) {
      return NextResponse.json(
        { ok: false, error: "Нет данных клиники" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const applied = applyPayWorkActToPersistedState(existing.data, {
      actId,
      method,
      amount,
    });
    if (!applied.ok) {
      return NextResponse.json(
        { ok: false, error: applied.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (applied.alreadyApplied) {
      return NextResponse.json(
        {
          ok: true,
          paymentId: applied.paymentId,
          fullyPaid: applied.fullyPaid,
          alreadyApplied: true,
          updatedAt: existing.updatedAt,
          revision: existing.revision,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    try {
      const saved = await saveClinicDataDb(session.clinicId, applied.state, {
        expectedUpdatedAt: existing.updatedAt,
        expectedRevision: existing.revision,
        autoMergeOnVersionConflict: false,
        replaceAppliedSnapshot: true,
      });
      return NextResponse.json(
        {
          ok: true,
          paymentId: applied.paymentId,
          fullyPaid: applied.fullyPaid,
          alreadyApplied: false,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      if (e instanceof ClinicRevisionConflictError) {
        lastConflictUpdatedAt = e.serverUpdatedAt;
        if (attempt < maxAttempts - 1) continue;
        return NextResponse.json(
          {
            ok: false,
            error: "Конфликт версии — обновите данные и повторите оплату",
            code: e.code,
            serverUpdatedAt: e.serverUpdatedAt,
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof PatientMassLossGuardError || e instanceof ScheduleMassLossGuardError) {
        return NextResponse.json(
          { ok: false, error: e.message, code: e.code },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      const msg = e instanceof Error ? e.message : "Не удалось сохранить оплату";
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Конфликт версии — обновите данные и повторите оплату",
      code: "REVISION_CONFLICT",
      serverUpdatedAt: lastConflictUpdatedAt,
    },
    { status: 409, headers: NO_STORE_HEADERS }
  );
}
