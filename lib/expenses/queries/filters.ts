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
}

export function buildExpenseWhere({
  dateFrom,
  dateTo,
  categoryId,
  paymentMethod,
  search,
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
  const q = search?.trim();
  if (q) {
    where.OR = [
      { supplier: { contains: q, mode: 'insensitive' } },
      { note: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}
