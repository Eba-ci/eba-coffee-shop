// lib/salaries/expense.ts
//
// Ligne GLOBALE de masse salariale (relation 1:N avec les versements).
//
// Décisions (validées) :
// - UNE ligne de dépense par jour de versement et par mode de paiement,
//   catégorie « Salaires » (nature FIXED), qui additionne les versements du jour
//   (salaire, acompte, avance) : aucun nom d'employé, aucun détail ;
// - la ligne est VISIBLE de tous les rôles qui voient les dépenses et compte
//   partout (stats, exports, rapport bancaire) : plus de trou comptable ;
// - elle porte un numéro de reçu normal (séquence DEP continue) et la mention
//   « automatique » : on ne la modifie jamais à la main, tout passe par un
//   versement du module employés ;
// - seules les lignes espèces touchent la caisse (cf. lib/cash-closing*.ts).

import type { ExpensePaymentMethod, Prisma } from '@/generated/prisma/client';
import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';

/** Mention affichée sur la ligne générée. */
export const SALARY_AGGREGATE_NOTE = 'Masse salariale (automatique)';

/** Refus d'édition manuelle de la ligne globale (modifier/supprimer). */
export const SALARY_AGGREGATE_LOCKED_MESSAGE =
  'Cette dépense est générée à partir des versements de salaire : modifiez ou supprimez le versement dans le module Employés.';

/** Clé du regroupement : `YYYY-MM-DD:MODE` (date UTC d'une colonne @db.Date). */
export function salaryAggregateKey(
  date: Date,
  paymentMethod: ExpensePaymentMethod
): string {
  return `${date.toISOString().slice(0, 10)}:${paymentMethod}`;
}

/** Champs d'une ligne globale (pur, sans accès base). */
export function salaryAggregateFields(
  date: Date,
  paymentMethod: ExpensePaymentMethod,
  amount: number
) {
  return {
    date,
    amount,
    paymentMethod,
    supplier: null,
    note: SALARY_AGGREGATE_NOTE,
    receiptUrl: null,
    fixedCostId: null,
    dueDate: null,
    salaryAggregateKey: salaryAggregateKey(date, paymentMethod),
  };
}

/**
 * Identifiant de la catégorie « Salaires », créée à la demande (nature FIXED)
 * si elle manque. Une catégorie du même nom soft-delete est « ressuscitée »
 * comme ailleurs dans les dépenses.
 *
 * `upsert` sur le nom unique : deux créations concurrentes ne lèvent pas de
 * P2002, l'une crée, l'autre met à jour.
 */
export async function getSalaryCategoryId(
  tx: Prisma.TransactionClient
): Promise<string> {
  const max = await tx.expenseCategory.aggregate({
    _max: { sortOrder: true },
  });
  const category = await tx.expenseCategory.upsert({
    where: { name: SALARY_EXPENSE_CATEGORY_NAME },
    create: {
      name: SALARY_EXPENSE_CATEGORY_NAME,
      nature: 'FIXED',
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
    // Un nom déjà pris (même soft-delete) est réutilisé tel quel, reclassé FIXED.
    update: { deletedAt: null, nature: 'FIXED' },
  });
  return category.id;
}
