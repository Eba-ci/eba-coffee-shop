// lib/fixed-costs/links-support.ts
//
// Briques partagées par la liaison / déliaison dépense ↔ échéance (#453) :
// verrous (ordre global du dépôt : charges d'abord, dépenses ensuite, chaque
// groupe dans l'ordre des identifiants), journal des liaisons, mise en forme
// d'une charge pour `schedule.ts`.

import type { Prisma } from '@/generated/prisma/client';
import { formatLocalDateOnly } from '@/lib/timezone';
import { toInstallmentLike, type ScheduledCost } from './schedule';

type Tx = Prisma.TransactionClient;

export type LinkActor = { userId: string | null; source: 'STAFF' | 'MCP' };

/**
 * Verrouille les charges puis les dépenses visées (`FOR UPDATE`). Deux lots
 * simultanés sur la même dépense se sérialisent : le second relit l'état
 * validé du premier (dépense déjà liée) au lieu de la lier deux fois.
 */
export async function lockLinkRows(
  tx: Tx,
  costIds: readonly string[],
  expenseIds: readonly string[]
) {
  const costs = [...new Set(costIds)].sort();
  const expenses = [...new Set(expenseIds)].sort();
  if (costs.length > 0)
    await tx.$queryRaw`SELECT "id" FROM "fixed_cost" WHERE "id" = ANY(${costs}) ORDER BY "id" FOR UPDATE`;
  if (expenses.length > 0)
    await tx.$queryRaw`SELECT "id" FROM "expense" WHERE "id" = ANY(${expenses}) ORDER BY "id" FOR UPDATE`;
}

/** Ligne du journal `FixedCostLinkEvent` (LINK / UNLINK). */
export async function logLinkEvent(
  tx: Tx,
  event: {
    expenseId: string;
    fixedCostId: string;
    dueDate: Date;
    action: 'LINK' | 'UNLINK';
  },
  actor: LinkActor
) {
  await tx.fixedCostLinkEvent.create({
    data: { ...event, actorId: actor.userId, source: actor.source },
  });
}

export type CostRow = {
  id: string;
  label: string;
  amount: number;
  periodicity: ScheduledCost['periodicity'];
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  categoryId: string;
  installments: { monthOffset: number; day: number; amount: number }[];
};

export function toScheduled(c: CostRow): ScheduledCost {
  return {
    id: c.id,
    label: c.label,
    amount: c.amount,
    periodicity: c.periodicity,
    startDate: formatLocalDateOnly(c.startDate),
    endDate: c.endDate ? formatLocalDateOnly(c.endDate) : null,
    // Rapprochement possible sur la fenêtre d'une charge désactivée.
    active: true,
    categoryId: c.categoryId,
    installments: c.installments.map(toInstallmentLike),
  };
}
