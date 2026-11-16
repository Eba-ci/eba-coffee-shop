// lib/fixed-costs/link-rules.ts
//
// Règles PURES de liaison dépense ↔ échéance (#453), appliquées côté SERVEUR
// par `links-mutations.ts` (jamais seulement côté interface).

export type LinkExpenseFacts = {
  id: string;
  categoryId: string;
  /** Charge/échéance déjà réglée par cette dépense. */
  fixedCostId: string | null;
  dueDate: string | null;
  /** Ligne globale de salaire ou dépense portée par un versement de salaire. */
  isSalary: boolean;
};

/** Message d'erreur (français) ou null si la liaison est permise. */
export function linkError(
  expense: LinkExpenseFacts | null,
  cost: { label: string; categoryId: string } | null,
  target: { costId: string; dueDate: string },
  occurrenceExists: boolean
): string | null {
  if (!expense) return 'Dépense introuvable (supprimée ?).';
  if (expense.isSalary)
    return 'Une dépense de salaire ne peut pas être rattachée à une charge fixe.';
  if (!cost) return 'Charge fixe introuvable.';
  if (expense.categoryId !== cost.categoryId)
    return `La dépense n’est pas dans la catégorie de la charge « ${cost.label} » : rapprochement inter-catégories refusé.`;
  if (
    expense.fixedCostId &&
    (expense.fixedCostId !== target.costId ||
      expense.dueDate !== target.dueDate)
  )
    return 'Cette dépense règle déjà une autre échéance : délie-la d’abord.';
  if (!occurrenceExists)
    return `Le ${target.dueDate} n’est pas une échéance de la charge « ${cost.label} ».`;
  return null;
}
