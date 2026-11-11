// lib/data-retention.ts
//
// Purge / anonymisation des données personnelles échues, selon la grille de
// config/data-protection.ts (publiée dans la politique de confidentialité).
// Appelée par GET /api/cron/data-retention. Idempotente : relancer ne fait
// rien de plus. Chaque étape est isolée — l'échec de l'une n'empêche pas les
// suivantes — et le rapport dit ce qui a été fait.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { anonymizeCustomer } from '@/lib/customer-privacy';
import { anonymizeExpiredSalaryData } from '@/lib/salaries/retention';
import { RETENTION, retentionCutoff } from '@/config/data-protection';

/** Plafond de fiches anonymisées par passage (borne la durée d'une requête). */
const CUSTOMER_BATCH = 200;

export type RetentionReport = Record<string, number | string>;

type Step = [name: string, run: () => Promise<number>];

export async function purgeExpiredPersonalData(
  nowMs = Date.now()
): Promise<RetentionReport> {
  const now = new Date(nowMs);
  const orderCutoff = retentionCutoff.years(RETENTION.orderYears, nowMs);
  const customerCutoff = retentionCutoff.years(
    RETENTION.inactiveCustomerYears,
    nowMs
  );

  const steps: Step[] = [
    [
      'ordersAnonymized',
      async () =>
        (
          await prisma.order.updateMany({
            where: {
              createdAt: { lt: orderCutoff },
              // Jamais une dette ouverte : on garde de quoi relancer.
              NOT: { isPaid: false, status: { not: 'CANCELLED' } },
              OR: [
                { customerName: { not: null } },
                { customerPhone: { not: null } },
                { note: { not: null } },
              ],
            },
            data: { customerName: null, customerPhone: null, note: null },
          })
        ).count,
    ],
    [
      'refundIdentitiesCleared',
      async () =>
        (
          await prisma.refund.updateMany({
            where: {
              createdAt: { lt: orderCutoff },
              // Jamais un remboursement encore en cours : on garde de quoi le terminer.
              status: { in: ['PAID', 'REJECTED', 'CANCELLED'] },
              OR: [
                { customerName: { not: null } },
                { destinationPhone: { not: null } },
              ],
            },
            data: { customerName: null, destinationPhone: null },
          })
        ).count,
    ],
    [
      'paymentProofsCleared',
      async () =>
        (
          await prisma.order.updateMany({
            where: {
              createdAt: {
                lt: retentionCutoff.months(RETENTION.paymentProofMonths, nowMs),
              },
              paymentProofUrl: { not: null },
            },
            data: {
              paymentProofUrl: null,
              paymentProofAnalysis: Prisma.DbNull,
            },
          })
        ).count,
    ],
    [
      'customersAnonymized',
      async () => {
        const stale = await prisma.customer.findMany({
          where: {
            anonymizedAt: null,
            // Un avoir non dépensé est une dette envers le client : jamais effacé.
            creditBalance: 0,
            updatedAt: { lt: customerCutoff },
            orders: { none: { createdAt: { gte: customerCutoff } } },
          },
          select: { id: true },
          take: CUSTOMER_BATCH,
        });
        let done = 0;
        for (const { id } of stale) {
          try {
            await anonymizeCustomer(id, now);
            done += 1;
          } catch {
            /* dette ouverte : on réessaiera au prochain passage */
          }
        }
        return done;
      },
    ],
    [
      // Employés sortis depuis plus de la durée de conservation (10 ans après
      // la fin du contrat) : nom / poste / note anonymisés, montants conservés.
      'salaryIdentitiesAnonymized',
      async () => anonymizeExpiredSalaryData(now),
    ],
    [
      'pollVoteMetaCleared',
      async () =>
        (
          await prisma.pollVote.updateMany({
            where: {
              createdAt: {
                lt: retentionCutoff.days(RETENTION.pollVoteMetaDays, nowMs),
              },
              OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
            },
            data: { ipAddress: null, userAgent: null },
          })
        ).count,
    ],
    [
      'pollSuggestionsCleared',
      async () =>
        (
          await prisma.pollSuggestion.updateMany({
            where: {
              createdAt: {
                lt: retentionCutoff.months(
                  RETENTION.pollSuggestionMonths,
                  nowMs
                ),
              },
              OR: [
                { submitterPhone: { not: null } },
                { submitterName: { not: null } },
              ],
            },
            data: { submitterPhone: null, submitterName: null },
          })
        ).count,
    ],
    [
      'orderPushDeleted',
      async () =>
        (
          await prisma.pushSubscription.deleteMany({
            where: {
              orderId: { not: null },
              createdAt: {
                lt: retentionCutoff.days(RETENTION.orderPushDays, nowMs),
              },
            },
          })
        ).count,
    ],
    [
      'assistantConversationsDeleted',
      async () =>
        (
          await prisma.assistantConversation.deleteMany({
            where: {
              updatedAt: {
                lt: retentionCutoff.days(
                  RETENTION.assistantConversationDays,
                  nowMs
                ),
              },
            },
          })
        ).count,
    ],
    [
      'sessionsDeleted',
      async () =>
        (await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }))
          .count,
    ],
    [
      'verificationsDeleted',
      async () =>
        (
          await prisma.verification.deleteMany({
            where: { expiresAt: { lt: now } },
          })
        ).count,
    ],
  ];

  const report: RetentionReport = {};
  for (const [name, run] of steps) {
    try {
      report[name] = await run();
    } catch (err) {
      report[name] = 'error';
      console.error(
        `[data-retention] ${name} a échoué:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return report;
}
