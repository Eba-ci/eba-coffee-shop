// lib/salaries/installments.ts
//
// Proposition d'échelonnement d'un arriéré (pure, rien n'est persisté) :
// N échéances mensuelles consécutives dont la somme égale exactement le total.
// Les unités restantes vont aux premières échéances (même règle que `money.ts`).

import { isValidMonth, shiftMonth } from '@/lib/salaries/month';

export const INSTALMENT_MIN_MONTHS = 1;
export const INSTALMENT_MAX_MONTHS = 36;

export type Instalment = { month: string; amount: number };

export function isValidInstalmentCount(months: number): boolean {
  return (
    Number.isInteger(months) &&
    months >= INSTALMENT_MIN_MONTHS &&
    months <= INSTALMENT_MAX_MONTHS
  );
}

/** Liste vide si le total est nul, ou si N / le mois de départ sont invalides. */
export function proposeInstalments(
  total: number,
  months: number,
  startMonth: string
): Instalment[] {
  if (!Number.isInteger(total) || total <= 0) return [];
  if (!isValidInstalmentCount(months) || !isValidMonth(startMonth)) return [];
  const base = Math.floor(total / months);
  const extra = total - base * months;
  return Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(startMonth, i),
    amount: base + (i < extra ? 1 : 0),
  }));
}

/**
 * Répartit un montant sur les mois d'arriéré, du plus ancien au plus récent,
 * sans dépasser le reste de chacun. Sert à préremplir le tiroir de règlement.
 */
export function allocateOldestFirst(
  amount: number,
  months: { month: string; remaining: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  let left = amount;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of sorted) {
    if (left <= 0) break;
    const part = Math.min(left, m.remaining);
    if (part > 0) out[m.month] = part;
    left -= part;
  }
  return out;
}
