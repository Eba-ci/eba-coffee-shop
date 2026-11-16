'use server';

// Rapprochement dépense ↔ échéance (#453). Écriture réservée à la finance
// (ADMIN, MANAGER, COMPTABLE) : l'ANALYSTE, en lecture seule, est refusé.

import { revalidatePath } from 'next/cache';
import { requireFinance } from '@/lib/auth-helpers';
import {
  linkExpenses,
  unlinkExpenses,
  type LinkOutcome,
} from '@/lib/fixed-costs/links-mutations';

export type LinkActionResult =
  | { ok: true; outcomes: LinkOutcome[] }
  | { ok: false; error: string };

function revalidate() {
  revalidatePath('/dashboard/depenses');
  revalidatePath('/dashboard/statistiques');
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : 'Erreur inattendue';

/** Lie un lot de dépenses à des échéances (atomique : tout ou rien). */
export async function linkExpensesAction(
  targets: unknown
): Promise<LinkActionResult> {
  const session = await requireFinance();
  try {
    const outcomes = await linkExpenses(targets, {
      userId: session.user.id,
      source: 'STAFF',
    });
    revalidate();
    return { ok: true, outcomes };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function unlinkExpensesAction(
  expenseIds: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireFinance();
  try {
    await unlinkExpenses(expenseIds, {
      userId: session.user.id,
      source: 'STAFF',
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}
