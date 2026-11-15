// lib/salaries/rate-periods.ts
//
// Périodes de taux (pur, sans accès base). Règles validées :
// - un taux s'applique à des MOIS ENTIERS : il commence le 1er d'un mois et se
//   termine le dernier jour d'un mois (ou reste en cours) ; un nouveau taux
//   s'applique donc le mois qui suit, jamais au milieu d'un mois ;
// - deux taux d'un même employé ne se chevauchent jamais ;
// - ajouter un taux qui commence après un taux « en cours » ferme ce dernier la
//   veille (cas courant d'une augmentation) ;
// - un changement qui modifie le dû d'un mois DÉJÀ versé est refusé.

import { salaryDueForMonth } from './due';
import { monthBounds, shiftMonth } from './month';
import type { EmployeeLike, SalaryRateLike } from './types';

export type RatePeriod = {
  id?: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
};

export type RateDraft = {
  /** Présent pour une modification : le taux est alors exclu des contrôles. */
  id?: string;
  monthlyAmount: number;
  startMonth: string;
  endMonth: string | null;
};

export type RatePlan =
  | { ok: true; rates: RatePeriod[]; closed: { id: string; endDate: string }[] }
  | { ok: false; error: string };

const label = (month: string) => month;

/** Premier et dernier jour couverts par un brouillon. */
export function draftBounds(draft: RateDraft): {
  startDate: string;
  endDate: string | null;
} {
  return {
    startDate: monthBounds(draft.startMonth).start,
    endDate: draft.endMonth ? monthBounds(draft.endMonth).end : null,
  };
}

function overlaps(a: RatePeriod, b: RatePeriod): boolean {
  const aEnd = a.endDate ?? '9999-12-31';
  const bEnd = b.endDate ?? '9999-12-31';
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/**
 * Place un taux parmi les existants : refuse un chevauchement, ferme
 * automatiquement le taux « en cours » qui le précède. Ne touche pas la base.
 */
export function planRatePeriods(
  existing: RatePeriod[],
  draft: RateDraft,
  employeeStartDate: string
): RatePlan {
  if (draft.endMonth && draft.endMonth < draft.startMonth) {
    return { ok: false, error: 'La fin du taux précède son début.' };
  }
  const { startDate, endDate } = draftBounds(draft);
  if (startDate.slice(0, 7) < employeeStartDate.slice(0, 7)) {
    return {
      ok: false,
      error:
        'Ce taux précède l’entrée de l’employé : choisissez un mois à partir de son entrée.',
    };
  }
  const candidate: RatePeriod = {
    id: draft.id,
    monthlyAmount: draft.monthlyAmount,
    startDate,
    endDate,
  };
  const others = existing.filter((r) => !draft.id || r.id !== draft.id);
  const closed: { id: string; endDate: string }[] = [];
  const next: RatePeriod[] = [];

  for (const other of others) {
    if (!overlaps(candidate, other)) {
      next.push(other);
      continue;
    }
    // Un taux « en cours » qui commence avant le nouveau est fermé la veille.
    if (other.endDate === null && other.startDate < startDate && other.id) {
      const end = monthBounds(shiftMonth(startDate.slice(0, 7), -1)).end;
      closed.push({ id: other.id, endDate: end });
      next.push({ ...other, endDate: end });
      continue;
    }
    return {
      ok: false,
      error: `Ce taux chevauche celui du ${other.startDate}${
        other.endDate ? ` au ${other.endDate}` : ' (en cours)'
      } : deux taux ne peuvent pas couvrir le même mois.`,
    };
  }
  next.push(candidate);
  next.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  return { ok: true, rates: next, closed };
}

export type PaidImpact = { month: string; before: number; after: number };

const asLikes = (rates: RatePeriod[]): SalaryRateLike[] =>
  rates.map((r) => ({
    monthlyAmount: r.monthlyAmount,
    startDate: r.startDate,
    endDate: r.endDate,
  }));

/**
 * Mois DÉJÀ versés dont le dû de base changerait entre `before` et `after`.
 * Vide = le changement ne joue sur aucun paiement enregistré. Primes et
 * retenues sont identiques des deux côtés : seul le prorata des taux compte.
 */
export function paidMonthImpacts(
  employee: EmployeeLike,
  before: RatePeriod[],
  after: RatePeriod[],
  paidMonths: Iterable<string>
): PaidImpact[] {
  const b = asLikes(before);
  const a = asLikes(after);
  const out: PaidImpact[] = [];
  for (const month of new Set(paidMonths)) {
    const prev = salaryDueForMonth(employee, b, month).baseDue;
    const next = salaryDueForMonth(employee, a, month).baseDue;
    if (prev !== next) out.push({ month, before: prev, after: next });
  }
  return out.sort((x, y) => (x.month < y.month ? -1 : 1));
}

/** Message de refus listant les mois payés touchés (aucun forçage possible). */
export function paidImpactMessage(impacts: PaidImpact[]): string {
  const months = impacts
    .map(
      (i) =>
        `${label(i.month)} (${i.before.toLocaleString('fr-FR')} → ${i.after.toLocaleString('fr-FR')} F)`
    )
    .join(', ');
  return `Ce changement modifierait des mois déjà versés : ${months}. Annulez d’abord les versements erronés de ces mois, puis corrigez le taux.`;
}
