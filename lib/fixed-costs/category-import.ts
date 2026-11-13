// lib/fixed-costs/category-import.ts
//
// Plan PUR d'import des catégories de dépenses de nature FIXED en charges
// fixes (#433). Aucun accès base : la mutation charge les données et applique
// le plan.

import { isSalaryNamed } from './salary-migration';

export type CategoryImportInput = {
  id: string;
  name: string;
  /** Montant de la dépense la plus récente de la catégorie (null = aucune). */
  lastAmount: number | null;
  /** Commentaire (`note`) de cette même dépense : devient le libellé de la charge. */
  lastNote?: string | null;
};

export type CategoryImportPlan = {
  /** Catégories à transformer en charge fixe (montant connu > 0). */
  toImport: { categoryId: string; label: string; amount: number }[];
  /** Noms des catégories sans montant connu : à compléter, rien n'est créé. */
  toComplete: string[];
  /** Noms des catégories « Salaires » ignorées. */
  skippedSalary: string[];
  /** Catégories déjà importées (rien à faire). */
  alreadyLinked: number;
};

export function planCategoryImport(
  categories: CategoryImportInput[],
  linkedCategoryIds: ReadonlySet<string>
): CategoryImportPlan {
  const plan: CategoryImportPlan = {
    toImport: [],
    toComplete: [],
    skippedSalary: [],
    alreadyLinked: 0,
  };
  for (const c of categories) {
    if (isSalaryNamed({ label: c.name, categoryName: c.name })) {
      plan.skippedSalary.push(c.name);
    } else if (linkedCategoryIds.has(c.id)) {
      plan.alreadyLinked += 1;
    } else if (c.lastAmount !== null && c.lastAmount > 0) {
      plan.toImport.push({
        categoryId: c.id,
        label: c.lastNote?.trim() || c.name,
        amount: c.lastAmount,
      });
    } else {
      plan.toComplete.push(c.name);
    }
  }
  return plan;
}
