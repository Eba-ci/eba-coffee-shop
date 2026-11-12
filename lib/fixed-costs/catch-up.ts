// lib/fixed-costs/catch-up.ts
//
// Rattrapage du point mort : un jour où le seuil n'est pas atteint, le manque
// n'est pas perdu, il est REPORTÉ sur les jours ouvrés restants du mois, à parts
// égales. PUR : travaille sur la série déjà calculée (`buildBreakEvenSeries`).
//
// Règles :
// - un jour échu (avant aujourd'hui) est figé : son objectif = seuil de base +
//   sa part du retard accumulé, et son résultat alimente le retard suivant ;
// - le retard est CUMULÉ : `max(0, retard + seuil − CA)`. Un jour au-dessus de
//   l'objectif rembourse du retard, jamais au-delà de zéro (pas de « crédit ») ;
// - aujourd'hui et les jours à venir portent la MÊME part du retard accumulé
//   jusqu'à hier : aujourd'hui n'est pas fini, son manque n'est pas encore acquis ;
// - le retard ne franchit pas la fin du mois (le dernier jour ouvré le solde) ;
// - un jour fermé ou à marge inconnue (seuil null) n'a ni objectif ni rattrapage.

import type { BreakEvenDay } from './compute';

function withTarget(day: BreakEvenDay, catchUp: number): BreakEvenDay {
  if (day.breakEven === null || !day.open) return day;
  const target = day.breakEven + catchUp;
  return {
    ...day,
    catchUp,
    target,
    remaining: Math.max(0, target - day.revenue),
    reached: day.revenue >= target,
  };
}

function catchUpMonth(days: BreakEvenDay[], today: string): BreakEvenDay[] {
  // Jours ouvrés restants à partir de chaque position (jour compris).
  const remainingOpen: number[] = new Array(days.length + 1).fill(0);
  for (let i = days.length - 1; i >= 0; i--)
    remainingOpen[i] = remainingOpen[i + 1] + (days[i].open ? 1 : 0);

  let arrears = 0;
  let futureShare: number | null = null;
  return days.map((day, i) => {
    if (!day.open || day.breakEven === null) return day;
    if (day.date >= today) {
      futureShare ??= Math.round(arrears / remainingOpen[i]);
      return withTarget(day, futureShare);
    }
    const share = Math.round(arrears / remainingOpen[i]);
    arrears = Math.max(0, arrears + day.breakEven - day.revenue);
    return withTarget(day, share);
  });
}

/** Applique le rattrapage mois par mois (le retard repart à zéro chaque mois). */
export function applyCatchUp(
  days: BreakEvenDay[],
  today: string
): BreakEvenDay[] {
  const out: BreakEvenDay[] = [];
  let start = 0;
  for (let i = 1; i <= days.length; i++) {
    if (
      i === days.length ||
      days[i].date.slice(0, 7) !== days[start].date.slice(0, 7)
    ) {
      out.push(...catchUpMonth(days.slice(start, i), today));
      start = i;
    }
  }
  return out;
}
