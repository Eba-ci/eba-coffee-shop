import { Prisma } from '@/generated/prisma/client';

export interface ExpenseFilters {
  /** Plage de jours civils (Date à minuit UTC, inclusive). */
  dateFrom?: Date;
  dateTo?: Date;
  categoryId?: string;
  /** Mode de paiement (CASH/WAVE/BANK/OTHER). */
  paymentMethod?: Prisma.ExpenseWhereInput['paymentMethod'];
  /** Recherche texte (fournisseur ou note, insensible à la casse). */
  search?: string;
  /**
   * Inclure les lignes de salaire (`Expense.salaryPaymentId` non nul). Faux
   * par défaut : ces lignes sont réservées à l'ADMIN, tout autre appel (listes,
   * totaux par catégorie, exports, MCP, assistant IA) les masque.
   */
  includeSalary?: boolean;
}

export function buildExpenseWhere({
  dateFrom,
  dateTo,
  categoryId,
  paymentMethod,
  search,
  includeSalary,
}: ExpenseFilters): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {};
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }
  if (categoryId) where.categoryId = categoryId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  // Confidentialité : une ligne de salaire n'est visible que si l'appelant
  // l'autorise explicitement (écrans ADMIN).
  if (!includeSalary) where.salaryPaymentId = null;
  const q = search?.trim();
  if (q) {
    where.OR = [
      { supplier: { contains: q, mode: 'insensitive' } },
      { note: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}
