import {
  ackClinicServerVersion,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import type { PaymentMethod } from "@/lib/types";

/**
 * Оплата акта через command API.
 * После ok вызывающий должен сначала применить оплату локально, затем markClinicSyncedAfterCommand.
 */
export async function payWorkActViaCommandApi(input: {
  actId: string;
  method: PaymentMethod;
  amount: number;
}): Promise<{
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
}> {
  try {
    const res = await fetch("/api/clinic/work-acts/pay", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actId: input.actId,
        method: input.method,
        amount: input.amount,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
      updatedAt?: string | null;
      revision?: number | null;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    ackClinicServerVersion(json.updatedAt ?? null, json.revision ?? null);
    notifyClinicDataChanged();
    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      updatedAt: json.updatedAt ?? null,
      revision: typeof json.revision === "number" ? json.revision : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}
