// Règlement en lot d'échéances de charges fixes (onglet Paiements). Chaque
// ligne est une dépense ordinaire, liée (`fixedCostId` + `dueDate`), créée par
// `createExpense` : même numérotation de reçu, mêmes règles de caisse, même
// garde « pas de dépassement de l'échéance ». Une transaction PAR ligne : un
// échec n'annule pas les autres et ne laisse jamais de paiement orphelin.

import { createExpense } from '@/lib/expenses/mutations/expenses';
import { getFixedCostOccurrence } from '@/lib/fixed-costs/payments-queries';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { todayDateString } from '@/lib/timezone';

export const BATCH_PAYMENTS_MAX = 50;

export type BatchTarget = { costId: string; dueDate: string };

export type BatchLineResult = BatchTarget & {
  status: 'created' | 'skipped' | 'failed';
  label?: string;
  amount?: number;
  message?: string;
};

export type BatchOptions = {
  /** Jour du paiement (défaut : aujourd'hui). */
  date?: string;
  paymentMethod?: string;
  /** Identifie la tentative : la même clé rejouée ne double aucun paiement. */
  batchKey: string;
};

/** Clé d'idempotence d'une ligne du lot. */
export function lineKey(batchKey: string, t: BatchTarget): string {
  return `${batchKey}:${t.costId}:${t.dueDate}`;
}

/** Doublons exacts retirés (même charge + même échéance), ordre conservé. */
export function dedupeTargets(targets: BatchTarget[]): BatchTarget[] {
  const seen = new Set<string>();
  return targets.filter((t) => {
    const k = `${t.costId}:${t.dueDate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function skipped(t: BatchTarget, o: Occurrence): BatchLineResult {
  return {
    ...t,
    status: 'skipped',
    label: o.label,
    message: 'Déjà réglée.',
  };
}

async function payLine(
  t: BatchTarget,
  opts: BatchOptions,
  userId: string
): Promise<BatchLineResult> {
  const occ = await getFixedCostOccurrence(t.costId, t.dueDate);
  if (!occ) return { ...t, status: 'failed', message: 'Échéance introuvable.' };
  // Reste relu à l'instant T : une échéance déjà réglée est ignorée.
  if (occ.remaining <= 0) return skipped(t, occ);
  try {
    await createExpense(
      {
        date: opts.date ?? todayDateString(),
        amount: occ.remaining,
        categoryId: occ.categoryId,
        paymentMethod: opts.paymentMethod ?? 'CASH',
        note: occ.label,
        fixedCostId: t.costId,
        dueDate: t.dueDate,
      },
      userId,
      { idempotencyKey: lineKey(opts.batchKey, t) }
    );
    return { ...t, status: 'created', label: occ.label, amount: occ.remaining };
  } catch (err) {
    // Course avec un autre enregistrement : si l'échéance est soldée entre-temps,
    // ce n'est pas une erreur.
    const again = await getFixedCostOccurrence(t.costId, t.dueDate).catch(
      () => null
    );
    if (again && again.remaining <= 0) return skipped(t, again);
    return {
      ...t,
      status: 'failed',
      label: occ.label,
      message: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

export async function payOccurrencesBatch(
  targets: BatchTarget[],
  opts: BatchOptions,
  userId: string
): Promise<BatchLineResult[]> {
  const unique = dedupeTargets(targets).slice(0, BATCH_PAYMENTS_MAX);
  const results: BatchLineResult[] = [];
  // Séquentiel : ordre des numéros de reçu stable, pas de rafale de verrous.
  for (const t of unique) results.push(await payLine(t, opts, userId));
  return results;
}
