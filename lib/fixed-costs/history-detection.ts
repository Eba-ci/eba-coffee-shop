// lib/fixed-costs/history-detection.ts
//
// Détection PURE de l'historique des catégories de dépense FIXED (#451).
// Aucun accès base : la lecture (`history-queries.ts`) charge les catégories et
// leurs dépenses, cette fonction se contente de les analyser.
//
// L'écran de détection est en LECTURE SEULE : il ne crée, ne modifie et ne lie
// rien. Le backfill est l'affaire de #452.

import { shiftMonth } from './month';
import { isSalaryNamed } from './salary-migration';

/** Une dépense déjà saisie, réduite à ce que la détection doit connaître. */
export type HistoryExpense = {
  /** Jour civil `YYYY-MM-DD`. */
  date: string;
  /** Montant en francs CFA. */
  amount: number;
};

/** Catégorie de dépense de nature FIXED, avec son état de conversion. */
export type HistoryCategory = {
  id: string;
  name: string;
  /** Au moins une charge fixe référence déjà cette catégorie. */
  hasFixedCost: boolean;
};

export type HistoryConfidence = 'probable' | 'to-review' | 'single';

export type HistoryMonth = {
  /** Mois civil `YYYY-MM`. */
  month: string;
  /** Somme exacte des dépenses de la catégorie sur ce mois. */
  total: number;
  /** Nombre de dépenses du mois. */
  count: number;
};

export type CategoryHistory = {
  categoryId: string;
  categoryName: string;
  firstMonth: string;
  lastMonth: string;
  /** Mois couverts (au moins une dépense), du plus ancien au plus récent. */
  months: HistoryMonth[];
  /** Mois SANS dépense entre `firstMonth` et `lastMonth` (bornes exclues). */
  gaps: string[];
  /**
   * Mois SANS dépense après `lastMonth`, jusqu'au mois de référence inclus.
   * Sert à signaler « puis plus rien » sans le confondre avec un trou interne.
   */
  trailingGaps: string[];
  /** `firstMonth` : prise d'effet proposée (le plus ancien mois payé). */
  suggestedStartMonth: string;
  /** Périodicité proposée : mensuelle par défaut (#451). */
  suggestedPeriodicity: 'MONTHLY';
  confidence: HistoryConfidence;
  /** La catégorie est déjà liée à une charge : ne pas la reconvertir. */
  alreadyConverted: boolean;
  /** Total cumulé des dépenses de la catégorie. */
  total: number;
  /** Nombre total de dépenses prises en compte. */
  expenseCount: number;
};

/** Trous internes tolérés pour rester « récurrente probable ». */
export const MAX_PROBABLE_GAPS = 1;
/** Au-delà, le mois le plus cher vaut plus du double du moins cher. */
export const IRREGULAR_AMOUNT_RATIO = 2;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthOf = (date: string) => date.slice(0, 7);

/**
 * Analyse les dépenses de chaque catégorie.
 *
 * `referenceMonth` (`YYYY-MM`) borne les mois sans dépense APRÈS le dernier
 * mois connu. Par défaut, il vaut le dernier mois de la catégorie : la fonction
 * reste ainsi déterministe sans horloge. L'écran lui passe le mois courant pour
 * afficher « aucune dépense depuis … ».
 *
 * Les catégories sans aucune dépense ne ressortent pas : il n'y a rien à
 * détecter. Les catégories de salaires sont toujours exclues.
 */
export function detectFixedCostHistory(
  categories: readonly HistoryCategory[],
  expensesByCategory: Readonly<Record<string, readonly HistoryExpense[]>>,
  referenceMonth?: string
): CategoryHistory[] {
  const out: CategoryHistory[] = [];
  for (const category of categories) {
    if (isSalaryNamed({ label: category.name, categoryName: category.name }))
      continue;

    const monthly = summarizeMonths(expensesByCategory[category.id] ?? []);
    if (monthly.length === 0) continue;

    const firstMonth = monthly[0].month;
    const lastMonth = monthly[monthly.length - 1].month;
    const total = monthly.reduce((sum, m) => sum + m.total, 0);
    const expenseCount = monthly.reduce((sum, m) => sum + m.count, 0);
    const gaps = missingMonths(firstMonth, lastMonth, monthly);
    const reference =
      referenceMonth && MONTH_RE.test(referenceMonth)
        ? referenceMonth
        : lastMonth;
    const trailingGaps =
      reference > lastMonth
        ? missingMonths(lastMonth, shiftMonth(reference, 1), monthly)
        : [];

    out.push({
      categoryId: category.id,
      categoryName: category.name,
      firstMonth,
      lastMonth,
      months: monthly,
      gaps,
      trailingGaps,
      suggestedStartMonth: firstMonth,
      suggestedPeriodicity: 'MONTHLY',
      confidence: classify(monthly, gaps),
      alreadyConverted: category.hasFixedCost,
      total,
      expenseCount,
    });
  }
  return out;
}

/** Regroupe les dépenses par mois civil, triés du plus ancien au plus récent. */
function summarizeMonths(expenses: readonly HistoryExpense[]): HistoryMonth[] {
  const byMonth = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const month = monthOf(expense.date);
    if (!MONTH_RE.test(month)) continue;
    const current = byMonth.get(month) ?? { total: 0, count: 0 };
    current.total += expense.amount;
    current.count += 1;
    byMonth.set(month, current);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, ...value }));
}

/**
 * Mois `YYYY-MM` sans dépense entre `from` et `to`, bornes exclues. Un mois
 * « couvert » est un mois présent dans `months`, pas un mois à total nul.
 */
function missingMonths(
  from: string,
  to: string,
  months: readonly HistoryMonth[]
): string[] {
  const covered = new Set(months.map((m) => m.month));
  const gaps: string[] = [];
  for (let m = shiftMonth(from, 1); m < to; m = shiftMonth(m, 1))
    if (!covered.has(m)) gaps.push(m);
  return gaps;
}

/**
 * « récurrente probable » : au moins 3 mois couverts, au plus un trou interne
 * et des montants du même ordre (le plus cher ne dépasse pas le double du
 * moins cher). « à vérifier » : deux mois, plusieurs trous ou montants très
 * irréguliers. « dépense unique » : un seul mois, jamais proposé d'office.
 */
function classify(
  months: readonly HistoryMonth[],
  gaps: readonly string[]
): HistoryConfidence {
  if (months.length === 1) return 'single';
  if (months.length === 2) return 'to-review';
  if (gaps.length > MAX_PROBABLE_GAPS) return 'to-review';
  const totals = months.map((m) => m.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  if (max > min * IRREGULAR_AMOUNT_RATIO) return 'to-review';
  return 'probable';
}
