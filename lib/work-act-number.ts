import type { Invoice, PatientPrepayment, WorkAct } from "@/lib/types";

/** Порядковый номер из «0095-07/2026» или «ПР-0095-07/2026» */
export function parseActSequenceNumber(actNumber: string | undefined | null): number | null {
  if (!actNumber) return null;
  const m = actNumber.trim().match(/^(?:ПР-)?(\d{1,6})(?:-\d{2}\/\d{4})?$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatWorkActNumber(sequence: number, at: Date = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  return `${String(sequence).padStart(4, "0")}-${month}/${year}`;
}

export function maxActSequenceFromLists(
  workActs: Array<{ actNumber?: string }>,
  prepayments: Array<{ actNumber?: string }> = [],
  actCounter = 1
): number {
  let max = Math.max(0, actCounter - 1);
  for (const act of workActs) {
    const n = parseActSequenceNumber(act.actNumber);
    if (n != null && n > max) max = n;
  }
  for (const p of prepayments) {
    const n = parseActSequenceNumber(p.actNumber);
    if (n != null && n > max) max = n;
  }
  return max;
}

/** Следующий свободный порядковый номер (ещё не использован в списках). */
export function allocateNextActSequence(
  workActs: Array<{ actNumber?: string }>,
  prepayments: Array<{ actNumber?: string }> = [],
  actCounter = 1
): number {
  return maxActSequenceFromLists(workActs, prepayments, actCounter) + 1;
}

function actKeepPriority(
  act: WorkAct,
  preferKeepIds?: ReadonlySet<string>
): number {
  let score = 0;
  if (act.paymentStatus === "paid") score += 1_000_000;
  if (preferKeepIds?.has(act.id)) score += 100_000;
  const created = Date.parse(act.createdAt || act.actDate || "");
  if (Number.isFinite(created)) {
    // Более ранний акт сохраняет номер
    score += Math.max(0, 2_000_000_000_000 - created) / 1_000_000;
  }
  // Стабильный tie-break
  score += Math.max(0, 10_000 - act.id.length) / 10_000;
  return score;
}

export interface EnsureUniqueActNumbersResult {
  workActs: WorkAct[];
  invoices: Invoice[];
  actCounter: number;
  renumbered: Array<{ id: string; from: string; to: string }>;
}

/**
 * Если у разных актов один actNumber (гонка двух врачей) — оставляем номер
 * у приоритетного (оплаченный / уже на сервере / раньше создан), остальным выдаём новые по порядку.
 */
export function ensureUniqueWorkActNumbers(input: {
  workActs: WorkAct[];
  invoices?: Invoice[];
  prepayments?: PatientPrepayment[];
  actCounter?: number;
  /** Id актов, которым предпочтительно оставить номер (уже были на сервере) */
  preferKeepIds?: ReadonlySet<string>;
}): EnsureUniqueActNumbersResult {
  const invoices = input.invoices ?? [];
  const prepayments = input.prepayments ?? [];
  const preferKeepIds = input.preferKeepIds;

  const byNumber = new Map<string, WorkAct[]>();
  for (const act of input.workActs) {
    const key = act.actNumber?.trim() || `__empty__:${act.id}`;
    const list = byNumber.get(key) ?? [];
    list.push(act);
    byNumber.set(key, list);
  }

  const hasDuplicates = [...byNumber.values()].some((list) => list.length > 1);
  if (!hasDuplicates) {
    const nextCounter = allocateNextActSequence(
      input.workActs,
      prepayments,
      input.actCounter ?? 1
    );
    return {
      workActs: input.workActs,
      invoices,
      actCounter: Math.max(input.actCounter ?? 1, nextCounter),
      renumbered: [],
    };
  }

  const usedSequences = new Set<number>();
  for (const p of prepayments) {
    const n = parseActSequenceNumber(p.actNumber);
    if (n != null) usedSequences.add(n);
  }

  let nextSeq = allocateNextActSequence(input.workActs, prepayments, input.actCounter ?? 1);
  const renumbered: Array<{ id: string; from: string; to: string }> = [];
  const replacements = new Map<string, WorkAct>();

  for (const [key, group] of byNumber) {
    if (group.length <= 1) {
      const only = group[0];
      if (only) {
        const n = parseActSequenceNumber(only.actNumber);
        if (n != null) usedSequences.add(n);
      }
      continue;
    }
    if (key.startsWith("__empty__:")) continue;

    const ranked = [...group].sort(
      (a, b) => actKeepPriority(b, preferKeepIds) - actKeepPriority(a, preferKeepIds)
    );
    const keeper = ranked[0]!;
    const keeperSeq = parseActSequenceNumber(keeper.actNumber);
    if (keeperSeq != null) usedSequences.add(keeperSeq);

    for (const dup of ranked.slice(1)) {
      while (usedSequences.has(nextSeq)) nextSeq += 1;
      const to = formatWorkActNumber(nextSeq, new Date(dup.actDate || Date.now()));
      usedSequences.add(nextSeq);
      nextSeq += 1;
      renumbered.push({ id: dup.id, from: dup.actNumber, to });
      replacements.set(dup.id, { ...dup, actNumber: to });
    }
  }

  if (renumbered.length === 0) {
    const nextCounter = allocateNextActSequence(
      input.workActs,
      prepayments,
      input.actCounter ?? 1
    );
    return {
      workActs: input.workActs,
      invoices,
      actCounter: Math.max(input.actCounter ?? 1, nextCounter),
      renumbered: [],
    };
  }

  const workActs = input.workActs.map((a) => replacements.get(a.id) ?? a);
  const renameById = new Map(renumbered.map((r) => [r.id, r]));

  const nextInvoices = invoices.map((inv) => {
    const change = inv.workActId ? renameById.get(inv.workActId) : undefined;
    if (!change) return inv;
    return {
      ...inv,
      description: inv.description.includes(change.from)
        ? inv.description.split(change.from).join(change.to)
        : inv.description,
    };
  });

  const actCounter = Math.max(
    input.actCounter ?? 1,
    allocateNextActSequence(workActs, prepayments, input.actCounter ?? 1)
  );

  return { workActs, invoices: nextInvoices, actCounter, renumbered };
}

/** Применить уникализацию номеров к снимку клиники */
export function withUniqueWorkActNumbers<
  T extends {
    workActs: WorkAct[];
    invoices: Invoice[];
    prepayments: PatientPrepayment[];
    actCounter: number;
  },
>(snapshot: T, preferKeepIds?: ReadonlySet<string>): T {
  const fixed = ensureUniqueWorkActNumbers({
    workActs: snapshot.workActs,
    invoices: snapshot.invoices,
    prepayments: snapshot.prepayments,
    actCounter: snapshot.actCounter,
    preferKeepIds,
  });
  if (fixed.renumbered.length === 0 && fixed.actCounter === snapshot.actCounter) {
    return snapshot;
  }
  return {
    ...snapshot,
    workActs: fixed.workActs,
    invoices: fixed.invoices,
    actCounter: fixed.actCounter,
  };
}
