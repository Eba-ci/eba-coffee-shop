// lib/salaries/cancel-mutations.ts
//
// Annulation d'un versement (ADMIN seul) : le versement n'est jamais supprimé.
// `canceledAt` le sort de tous les calculs (versé, arriéré, dépense globale) ;
// il garde son auteur et son motif. La ligne de masse salariale est recalculée
// dans la même transaction (supprimée si plus rien ne la porte).
//
// Idempotent : rejouer l'annulation d'un versement déjà annulé ne change rien
// (ni second horodatage, ni second recalcul).

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { salaryPaymentCancelSchema } from '@/lib/schemas/salary';
import { formatLocalDateOnly } from '@/lib/timezone';
import { keyOf, syncSalaryExpenses, withRetry } from './expense-sync';

export const SALARY_CANCEL_CLOSED_DAY_MESSAGE =
  'La caisse de ce jour est déjà clôturée : annuler ce versement en espèces fausserait la clôture. Enregistrez un versement de correction.';

export async function cancelSalaryPayment(input: unknown) {
  const session = await requireAdmin();
  const d = salaryPaymentCancelSchema.parse(input);

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.findUnique({
        where: { id: d.paymentId },
      });
      if (!payment) throw new Error('Versement introuvable.');
      if (payment.canceledAt) return { id: payment.id, replayed: true };

      // Seuls les versements en espèces touchent le tiroir : on réutilise la
      // règle de clôture existante (une clôture enregistrée pour ce jour).
      if (payment.paymentMethod === 'CASH') {
        const closing = await tx.cashClosing.findUnique({
          where: { date: payment.date },
          select: { id: true },
        });
        if (closing) {
          throw new Error(
            `${SALARY_CANCEL_CLOSED_DAY_MESSAGE} (${formatLocalDateOnly(payment.date)})`
          );
        }
      }

      // Détaché de sa ligne globale (RESTRICT) avant le recalcul.
      await tx.salaryPayment.update({
        where: { id: payment.id },
        data: {
          canceledAt: new Date(),
          canceledById: session.user.id,
          cancelReason: d.reason,
          expenseId: null,
        },
      });
      await syncSalaryExpenses(tx, [keyOf(payment)], session.user.id);
      return { id: payment.id, replayed: false };
    })
  );
}
