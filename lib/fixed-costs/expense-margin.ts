// lib/fixed-costs/expense-margin.ts
//
// Marge ESTIMÉE d'après les dépenses variables (achats courants), en repli
// quand les coûts de revient des produits ne couvrent pas assez de CA. PUR :
// le total des dépenses variables est lu par `expense-margin-query.ts`.
//
// C'est une approximation : un achat n'est pas une consommation (stock), d'où
// une fenêtre plus longue que la marge « produits ».

export type MarginSource = 'products' | 'expenses';

/**
 * Taux de marge (0..1) = (CA − dépenses variables) ÷ CA. `null` sans CA, sans
 * aucune dépense variable (taux de 100 % trompeur) ou si les dépenses dépassent
 * le CA (taux négatif : pas de seuil fiable).
 */
export function marginRateFromExpenses(
  revenue: number,
  variableExpenses: number
): number | null {
  if (revenue <= 0 || variableExpenses <= 0) return null;
  const rate = (revenue - variableExpenses) / revenue;
  return rate > 0 ? Math.min(rate, 1) : null;
}
