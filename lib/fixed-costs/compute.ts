// lib/fixed-costs/compute.ts
//
// Calcul PUR du coût fixe par jour ouvré et du point mort. Rien ici ne touche
// la base : horaires et charges sont passés en paramètre (testable, et
// réutilisable côté client).
//
// Règle : le montant d'une charge couvre sa période (mois civil, semaine,
// trimestre, année) ; il est réparti à parts égales sur les JOURS OUVRÉS de
// cette période. Un jour fermé ne porte aucune charge — son point mort est 0.

import type { FixedCostPeriodicity } from '@/generated/prisma/enums';
import { countOpenDays, type OpenDayPredicate } from './open-days';
import { periodContaining } from './periods';

export type FixedCostLike = {
  id: string;
  label: string;
  amount: number;
  periodicity: FixedCostPeriodicity;
  startDate: string; // YYYY-MM-DD, prise d'effet
  endDate: string | null; // incluse
  active: boolean;
};

/** Mémoïse le nombre de jours ouvrés d'une période (un an = 365 tests sinon). */
export function createOpenDayCounter(isOpen: OpenDayPredicate) {
  const cache = new Map<string, number>();
  return (start: string, end: string): number => {
    const key = `${start}|${end}`;
    let n = cache.get(key);
    if (n === undefined) {
      n = countOpenDays(start, end, isOpen);
      cache.set(key, n);
    }
    return n;
  };
}

export type OpenDayCounter = ReturnType<typeof createOpenDayCounter>;

/** La charge s'applique-t-elle ce jour (active, dans sa fenêtre) ? */
export function isCostInEffect(cost: FixedCostLike, day: string): boolean {
  if (!cost.active) return false;
  if (day < cost.startDate) return false;
  if (cost.endDate && day > cost.endDate) return false;
  return true;
}

/**
 * Coût de la charge pour `day` (FCFA, non arrondi) : 0 si fermé, hors fenêtre,
 * ou si la période n'a aucun jour ouvré (rien à répartir).
 */
export function dailyCostFor(
  cost: FixedCostLike,
  day: string,
  isOpen: OpenDayPredicate,
  countOpen: OpenDayCounter
): number {
  if (!isCostInEffect(cost, day) || !isOpen(day)) return 0;
  if (cost.periodicity === 'DAILY') return cost.amount;
  const period = periodContaining(day, cost.periodicity);
  const open = countOpen(period.start, period.end);
  return open > 0 ? cost.amount / open : 0;
}

export type FixedCostShare = { id: string; label: string; amount: number };

/**
 * Identité de la ligne unique des salaires dans le détail d'un jour. Le total
 * mensuel des salaires est un nombre global (sans employé) : il n'apparaît
 * jamais qu'en une seule ligne, jamais nominative.
 */
export const SALARY_SHARE_ID = 'salaries';
export const SALARY_SHARE_LABEL = 'Salaires';

/**
 * Part journalière du montant GLOBAL des salaires d'un mois (un nombre, sans
 * détail) : réparti à parts égales sur les JOURS OUVRÉS du mois contenant
 * `day`, comme une charge MONTHLY. 0 un jour fermé, ou si le montant est nul.
 */
export function dailySalaryCost(
  salariesMonthly: number,
  day: string,
  isOpen: OpenDayPredicate,
  countOpen: OpenDayCounter
): number {
  if (salariesMonthly <= 0 || !isOpen(day)) return 0;
  const period = periodContaining(day, 'MONTHLY');
  const open = countOpen(period.start, period.end);
  return open > 0 ? salariesMonthly / open : 0;
}

export function fixedCostsForDay(
  costs: FixedCostLike[],
  day: string,
  isOpen: OpenDayPredicate,
  countOpen: OpenDayCounter,
  salariesMonthly = 0
): { total: number; shares: FixedCostShare[] } {
  const shares: FixedCostShare[] = [];
  let total = 0;
  for (const cost of costs) {
    const amount = dailyCostFor(cost, day, isOpen, countOpen);
    if (amount <= 0) continue;
    shares.push({ id: cost.id, label: cost.label, amount });
    total += amount;
  }
  const salary = dailySalaryCost(salariesMonthly, day, isOpen, countOpen);
  if (salary > 0) {
    shares.push({
      id: SALARY_SHARE_ID,
      label: SALARY_SHARE_LABEL,
      amount: salary,
    });
    total += salary;
  }
  return { total, shares };
}

/**
 * Taux de marge (0..1) sur des lignes de commande. Seules les lignes dont le
 * coût est connu entrent dans le taux ; `coverage` = part du CA dont le coût
 * est connu. Sous `MIN_COST_COVERAGE`, le taux est jugé non fiable (`null`).
 */
export const MIN_COST_COVERAGE = 0.5;

export type MarginInput = {
  revenue: number; // CA des lignes, coût connu ou non
  revenueWithCost: number; // CA des seules lignes à coût connu
  cost: number; // coût figé de ces lignes
};

export type MarginRate = {
  rate: number | null;
  coverage: number;
};

export function computeMarginRate(input: MarginInput): MarginRate {
  const coverage =
    input.revenue > 0 ? input.revenueWithCost / input.revenue : 0;
  if (input.revenueWithCost <= 0 || coverage < MIN_COST_COVERAGE) {
    return { rate: null, coverage };
  }
  const rate = (input.revenueWithCost - input.cost) / input.revenueWithCost;
  return { rate: rate > 0 ? Math.min(rate, 1) : null, coverage };
}

/** CA minimal pour couvrir `fixed` à ce taux de marge ; 0 si rien à couvrir. */
export function breakEvenRevenue(
  fixed: number,
  marginRate: number | null
): number | null {
  if (fixed <= 0) return 0;
  if (marginRate === null || marginRate <= 0) return null;
  return Math.ceil(fixed / marginRate);
}

export type BreakEvenDay = {
  date: string;
  open: boolean;
  revenue: number; // CA net du jour
  fixedCost: number; // charges fixes + salaires du jour (arrondies)
  salaryCost: number; // part des salaires du jour (agrégat, sans employé)
  breakEven: number | null; // CA minimal de BASE ; 0 si fermé ; null si marge inconnue
  /** Rattrapage du jour : part des manques des jours échus (cf. catch-up.ts). */
  catchUp: number;
  /** Objectif du jour = `breakEven` + `catchUp` (identique hors rattrapage). */
  target: number | null;
  remaining: number | null; // reste à faire pour atteindre l'objectif du jour
  grossMargin: number | null; // marge estimée = CA × taux
  result: number | null; // marge − charges fixes
  reached: boolean | null; // seuil atteint ? null si indéterminé / fermé
  shares: FixedCostShare[];
};

export function buildBreakEvenSeries(args: {
  days: { date: string; revenue: number }[];
  costs: FixedCostLike[];
  isOpen: OpenDayPredicate;
  marginRate: number | null;
  /** Total GLOBAL des salaires par mois `YYYY-MM` (un nombre, sans employé). */
  salariesByMonth?: Record<string, number>;
}): BreakEvenDay[] {
  const countOpen = createOpenDayCounter(args.isOpen);
  return args.days.map(({ date, revenue }) => {
    const open = args.isOpen(date);
    const salariesMonthly = args.salariesByMonth?.[date.slice(0, 7)] ?? 0;
    const { total, shares } = fixedCostsForDay(
      args.costs,
      date,
      args.isOpen,
      countOpen,
      salariesMonthly
    );
    const salaryCost =
      shares.find((s) => s.id === SALARY_SHARE_ID)?.amount ?? 0;
    const fixedCost = Math.round(total);
    const breakEven = open ? breakEvenRevenue(fixedCost, args.marginRate) : 0;
    const grossMargin =
      args.marginRate === null ? null : Math.round(revenue * args.marginRate);
    return {
      date,
      open,
      revenue,
      fixedCost,
      salaryCost,
      breakEven,
      catchUp: 0,
      target: breakEven,
      remaining: breakEven === null ? null : Math.max(0, breakEven - revenue),
      grossMargin,
      result: grossMargin === null ? null : grossMargin - fixedCost,
      reached: !open || breakEven === null ? null : revenue >= breakEven,
      shares,
    };
  });
}
