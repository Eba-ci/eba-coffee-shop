// lib/fixed-costs/backfill.ts
//
// Règles PURES du backfill d'une charge fixe (#452) : on matérialise
// l'historique en donnant à la charge une prise d'effet PASSÉE. Aucune dépense
// n'est créée, aucun montant inventé : les occurrences se calculent à la
// lecture (cf. `schedule.ts`) et restent « en retard » tant qu'aucune dépense
// n'y est liée (#453).

import type { FixedCostBackfillInput } from '@/lib/schemas/fixed-cost';
import { installmentsError } from './installments';

export type BackfillContext = {
  /** Jour civil du jour, `YYYY-MM-DD`. */
  today: string;
  /** Mois `YYYY-MM` de la première dépense de la catégorie (null = aucune). */
  firstDetectedMonth: string | null;
};

export type BackfillPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      startDate: string;
      /** Avertissement non bloquant (historique antérieur hors périmètre). */
      warning: string | null;
    };

/**
 * Valide la prise d'effet, commune à la création et à la correction : jamais
 * dans le futur ; avertissement si elle est postérieure au premier mois détecté.
 */
export function planBackfillStart(
  startDate: string,
  ctx: BackfillContext
): BackfillPlan {
  if (startDate > ctx.today)
    return {
      ok: false,
      error:
        'La prise d’effet ne peut pas être dans le futur : le backfill sert à rattraper le passé.',
    };
  const month = startDate.slice(0, 7);
  const warning =
    ctx.firstDetectedMonth && month > ctx.firstDetectedMonth
      ? `La première dépense date de ${ctx.firstDetectedMonth} : l’historique antérieur à ${month} restera hors périmètre.`
      : null;
  return { ok: true, startDate, warning };
}

/** Contrôle d'une CRÉATION : libellé, montant > 0, périodicité et échéances. */
export function planBackfillCreate(
  input: FixedCostBackfillInput,
  ctx: BackfillContext
): BackfillPlan {
  const start = planBackfillStart(input.startDate, ctx);
  if (!start.ok) return start;
  if (!input.label?.trim()) return { ok: false, error: 'Libellé requis.' };
  if (!input.amount || input.amount <= 0)
    return {
      ok: false,
      error: 'Montant requis : aucun montant n’est déduit à ta place.',
    };
  if (input.periodicity === 'DAILY')
    return {
      ok: false,
      error:
        'Une charge par jour ouvré n’a pas d’échéance : l’historique à rattraper ne s’y applique pas.',
    };
  const err = installmentsError(
    input.periodicity,
    input.amount,
    input.installments ?? []
  );
  return err ? { ok: false, error: err } : start;
}
