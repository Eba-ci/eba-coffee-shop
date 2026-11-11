// lib/salaries/advance-mutations.ts
//
// Corrections d'une AVANCE, demandées par la revue de #419 : jusqu'ici aucune
// mutation ne permettait de modifier l'étalement d'une avance, ni de l'ajuster
// ou de l'annuler. Les trois opérations ci-dessous sont réservées à l'ADMIN et
// IDEMPOTENTES : rejouer la même requête (double clic) laisse l'état inchangé —
// un `update` pose la valeur visée, un `delete` déjà effectué renvoie le même
// succès. Le journal de paie étant recalculé à la lecture (`ledger.ts`), une
// avance ajustée ou annulée change aussitôt les soldes des mois suivants.

import { SALARY_ADVANCE_ONLY_MESSAGE } from '@/config/constants';
import type { SalaryPaymentType } from '@/generated/prisma/enums';
import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  salaryAdvanceAdjustSchema,
  salaryAdvanceCancelSchema,
  salaryAdvanceRecoverySchema,
} from '@/lib/schemas/salary';
import { parseDateOnlyToUTC } from '@/lib/timezone';

/** Vérifie que la ligne ciblée est bien une AVANCE (jamais un salaire/acompte). */
function assertAdvance(type: SalaryPaymentType): void {
  if (type !== 'AVANCE') throw new Error(SALARY_ADVANCE_ONLY_MESSAGE);
}

/**
 * Modifie l'étalement (`recoveryMonths`) de la récupération d'une avance.
 * Idempotent : reposer la même valeur ne réécrit rien.
 */
export async function updateAdvanceRecovery(input: unknown) {
  await requireAdmin();
  const d = salaryAdvanceRecoverySchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.salaryPayment.findUniqueOrThrow({
      where: { id: d.paymentId },
    });
    assertAdvance(payment.type);
    if (payment.recoveryMonths === d.recoveryMonths) return payment;
    return tx.salaryPayment.update({
      where: { id: payment.id },
      data: { recoveryMonths: d.recoveryMonths },
    });
  });
}

/**
 * Ajuste le contenu d'une avance (montant, date, mois, mode, note). Idempotent :
 * les valeurs visées sont posées, un rejeu identique ne change rien.
 */
export async function adjustSalaryAdvance(input: unknown) {
  await requireAdmin();
  const d = salaryAdvanceAdjustSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.salaryPayment.findUniqueOrThrow({
      where: { id: d.paymentId },
    });
    assertAdvance(payment.type);
    return tx.salaryPayment.update({
      where: { id: payment.id },
      data: {
        ...(d.amount !== undefined ? { amount: d.amount } : {}),
        ...(d.date !== undefined ? { date: parseDateOnlyToUTC(d.date)! } : {}),
        ...(d.month !== undefined ? { month: d.month } : {}),
        ...(d.paymentMethod !== undefined
          ? { paymentMethod: d.paymentMethod }
          : {}),
        ...(d.note !== undefined ? { note: d.note } : {}),
      },
    });
  });
}

/**
 * Annule une avance (suppression). Idempotent : une avance déjà annulée (ou
 * inexistante) renvoie le même succès plutôt qu'une erreur de course.
 */
export async function cancelSalaryAdvance(input: unknown) {
  await requireAdmin();
  const d = salaryAdvanceCancelSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.salaryPayment.findUnique({
      where: { id: d.paymentId },
    });
    if (!payment) return { id: d.paymentId, cancelled: true };
    assertAdvance(payment.type);
    await tx.salaryPayment.delete({ where: { id: payment.id } });
    return { id: payment.id, cancelled: true };
  });
}
