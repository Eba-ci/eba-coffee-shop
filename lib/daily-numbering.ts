import type { Prisma } from '@/generated/prisma/client';
import { startOfLocalDay } from '@/lib/timezone';

const MAX_RETRIES = 3;

/** Espace de noms des verrous consultatifs de la numérotation (premier entier de la paire). */
const DAILY_NUMBER_LOCK_NAMESPACE = 7101;
const DAY_MS = 86_400_000;

/** Jour civil → entier (second entier de la paire de verrous). */
const dayIndex = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/**
 * Calcule le prochain numéro de commande pour la journée donnée.
 *
 * Stratégie thread-safe :
 *   1. SELECT MAX(dailyNumber) + 1 dans une transaction
 *   2. L'index unique (dailyDate, dailyNumber) attrape les races
 *   3. Retry jusqu'à MAX_RETRIES sur conflit
 *
 * À appeler depuis createOrder/createCashierOrder, jamais en parallèle pour la
 * même commande.
 */
export async function getNextDailyNumber(
  tx: Prisma.TransactionClient,
  dailyDate: Date
): Promise<number> {
  // Verrou consultatif PAR JOUR, tenu jusqu'à la fin de la transaction : les créations
  // simultanées font la queue au lieu de calculer toutes le même « max + 1 », de se
  // heurter à l'index unique, puis de rejouer ensemble leurs 3 tentatives. Sans lui,
  // dès 4 créations au même instant, des commandes étaient perdues (erreur de
  // contrainte unique). Le verrou est pris AVANT toute ligne de stock : un seul ordre.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DAILY_NUMBER_LOCK_NAMESPACE}::int, ${dayIndex(dailyDate)}::int)`;
  // staff-visibility: exempt — le numéro du jour compte TOUTES les commandes, y compris en attente de paiement, pour qu'aucun numéro ne soit réutilisé
  const result = await tx.order.aggregate({
    where: { dailyDate },
    _max: { dailyNumber: true },
  });
  const current = result._max.dailyNumber ?? 0;
  return current + 1;
}

/** Helper : renvoie startOfLocalDay(new Date()) — utilisé partout pour aligner. */
export function todayDailyDate(): Date {
  return startOfLocalDay(new Date());
}

export const DAILY_NUMBER_MAX_RETRIES = MAX_RETRIES;
