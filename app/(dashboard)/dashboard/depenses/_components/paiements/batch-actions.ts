'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireFinance } from '@/lib/auth-helpers';
import {
  BATCH_PAYMENTS_MAX,
  payOccurrencesBatch,
  type BatchLineResult,
} from '@/lib/fixed-costs/batch-payments';
import { expensePaymentMethodSchema } from '@/lib/schemas/expense';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const inputSchema = z.object({
  targets: z
    .array(z.object({ costId: z.string().min(1), dueDate: dateOnly }))
    .min(1, 'Aucune échéance sélectionnée.')
    .max(BATCH_PAYMENTS_MAX, `${BATCH_PAYMENTS_MAX} échéances au maximum.`),
  date: dateOnly.optional(),
  paymentMethod: expensePaymentMethodSchema.optional(),
  batchKey: z.string().min(8).max(100),
});

export type BatchActionResult =
  | { ok: true; results: BatchLineResult[] }
  | { ok: false; error: string };

/** Règle en une fois plusieurs échéances de charges fixes (droits finance). */
export async function payOccurrencesBatchAction(
  input: unknown
): Promise<BatchActionResult> {
  const session = await requireFinance();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Sélection invalide.',
    };
  const { targets, ...opts } = parsed.data;
  try {
    const results = await payOccurrencesBatch(targets, opts, session.user.id);
    revalidatePath('/dashboard/depenses');
    revalidatePath('/dashboard/statistiques');
    return { ok: true, results };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}
