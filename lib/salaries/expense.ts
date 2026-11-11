// lib/salaries/expense.ts
//
// Lien entre un versement de salaire et la dépense qui le matérialise.
//
// Décisions (validées) :
// - UNE ligne de dépense par versement (salaire, acompte, avance), catégorie
//   « Salaires » (nature FIXED), SANS nom d'employé (ni note, ni fournisseur) ;
// - aucun numéro de reçu : la séquence DEP-YYYY-MM-NNNN des vraies dépenses
//   reste continue et sans trou trahissant un salaire ;
// - la dépense porte le mode de paiement du versement : seules les lignes
//   espèces touchent la caisse (cf. lib/cash-closing*.ts).

import type { ExpensePaymentMethod, Prisma } from '@/generated/prisma/client';
import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';

/** Forme minimale d'un versement suffisante pour construire la dépense miroir. */
export type SalaryPaymentForExpense = {
  date: Date;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
};

/** Champs d'une dépense miroir de versement (pur, sans accès base). */
export function salaryExpenseFields(payment: SalaryPaymentForExpense) {
  return {
    date: payment.date,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    supplier: null,
    note: null,
    receiptUrl: null,
    // Pas de numéro de reçu : un versement n'en consomme aucun.
    receiptNo: null,
    receiptPeriod: null,
    receiptSeq: null,
    fixedCostId: null,
    dueDate: null,
  };
}

/**
 * Identifiant de la catégorie « Salaires », créée à la demande (nature FIXED)
 * si elle manque. Une catégorie du même nom soft-delete est « ressuscitée »
 * comme ailleurs dans les dépenses.
 */
export async function getSalaryCategoryId(
  tx: Prisma.TransactionClient
): Promise<string> {
  const existing = await tx.expenseCategory.findUnique({
    where: { name: SALARY_EXPENSE_CATEGORY_NAME },
  });
  if (existing) {
    if (existing.deletedAt) {
      await tx.expenseCategory.update({
        where: { id: existing.id },
        data: { deletedAt: null, nature: 'FIXED' },
      });
    }
    return existing.id;
  }
  const max = await tx.expenseCategory.aggregate({
    _max: { sortOrder: true },
  });
  const created = await tx.expenseCategory.create({
    data: {
      name: SALARY_EXPENSE_CATEGORY_NAME,
      nature: 'FIXED',
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return created.id;
}
