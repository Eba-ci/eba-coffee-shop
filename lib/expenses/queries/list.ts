import { cache } from 'react';
import prisma from '@/lib/prisma';
import { type ExpenseFilters, buildExpenseWhere } from './filters';

/** Nombre de dépenses sans numéro de reçu (hors lignes de salaire, non numérotées). */
export function countUnnumberedExpenses() {
  return prisma.expense.count({
    where: { receiptNo: null, salaryPaymentId: null },
  });
}

/** Catégories triées, avec le nombre de dépenses rattachées. */
export const listExpenseCategories = cache(
  async function listExpenseCategories() {
    return prisma.expenseCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
  }
);

export async function getEarliestExpenseDate(
  filters: Omit<ExpenseFilters, 'dateFrom' | 'dateTo'> = {}
): Promise<Date | null> {
  const where = buildExpenseWhere(filters);
  const result = await prisma.expense.aggregate({
    where,
    _min: { date: true },
  });
  return result._min.date ?? null;
}

/** Liste des dépenses filtrées + total (somme des montants). */
export async function listExpenses(filters: ExpenseFilters = {}) {
  const where = buildExpenseWhere(filters);
  const [expenses, agg] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
  ]);
  return {
    expenses,
    total: agg._sum.amount ?? 0,
    count: agg._count,
  };
}

/** Une dépense et son détail, prêts à alimenter le formulaire de saisie. */
export type ExpenseForEdit = {
  id: string;
  date: Date;
  amount: number;
  categoryId: string;
  paymentMethod: string;
  supplier: string | null;
  note: string | null;
  receiptUrl: string | null;
  /** Non nul = ligne de salaire (réservée à l'ADMIN, non éditable ici). */
  salaryPaymentId: string | null;
  items: {
    articleId: string | null;
    rawLabel: string;
    label: string | null;
    formatQty: number | null;
    formatSize: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number;
    pendingQuantity: boolean;
  }[];
};

/** Une dépense unique avec son détail, pour l'écran d'édition/duplication. */
export async function getExpenseForEdit(
  id: string
): Promise<ExpenseForEdit | null> {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!expense) return null;

  return {
    id: expense.id,
    date: expense.date,
    amount: expense.amount,
    categoryId: expense.categoryId,
    paymentMethod: expense.paymentMethod,
    supplier: expense.supplier,
    note: expense.note,
    receiptUrl: expense.receiptUrl,
    salaryPaymentId: expense.salaryPaymentId,
    items: expense.items.map((item) => ({
      articleId: item.articleId,
      rawLabel: item.rawLabel,
      label: item.label,
      formatQty: item.formatQty?.toNumber() ?? null,
      formatSize: item.formatSize?.toNumber() ?? null,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount,
      pendingQuantity: item.pendingQuantity,
    })),
  };
}
