import { fetchClinicDataMetaFromServer } from "@/lib/clinic-data-client";
import { requestForcePullClinicDataFromServer } from "@/lib/clinic-data-sync.client";
import type { PaymentMethod } from "@/lib/types";

/**
 * Оплата акта через command API. При ошибке сети/403 — fallback на локальный payWorkAct.
 */
export async function payWorkActViaCommandApi(input: {
  actId: string;
  method: PaymentMethod;
  amount: number;
}): Promise<{ ok: boolean; alreadyApplied?: boolean; error?: string }> {
  try {
    const meta = await fetchClinicDataMetaFromServer();
    const res = await fetch("/api/clinic/work-acts/pay", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actId: input.actId,
        method: input.method,
        amount: input.amount,
        expectedUpdatedAt: meta?.updatedAt ?? null,
        expectedRevision: meta?.revision ?? null,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    await requestForcePullClinicDataFromServer({
      force: true,
      allowApplyDespitePending: true,
      allowDuringSaveCooldown: true,
    });
    return { ok: true, alreadyApplied: Boolean(json.alreadyApplied) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}
