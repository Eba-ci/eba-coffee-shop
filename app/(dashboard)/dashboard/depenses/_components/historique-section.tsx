// Onglet "Historique" : table paginée des dépenses + détail par article.
// Section autonome — `listExpenses` n'est PAS borné par `effectiveFrom`
// (contrairement à `apercu-section`) : en mode "tout l'historique" elle lit
// simplement toutes les dépenses filtrées, sans requête intermédiaire.

import { Download } from 'lucide-react';
import { listExpenses, listExpenseCategories } from '@/lib/expenses';
import prisma from '@/lib/prisma';
import { formatLocalDateOnly } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExpensesTable, type ExpenseRow } from '../expenses-table';
import { CategoryFilter } from '../category-filter';
import { ExpenseFilters } from '../expense-filters';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  BANK: 'Banque',
  OTHER: 'Autre',
};

export async function HistoriqueSection({
  dateFrom,
  dateTo,
  categoryId,
  paymentMethod,
  search,
  periodLabel,
  exportHref,
  includeSalary,
}: {
  dateFrom?: Date;
  dateTo?: Date;
  categoryId?: string;
  paymentMethod?: 'CASH' | 'WAVE' | 'BANK' | 'OTHER';
  search?: string;
  periodLabel: string;
  exportHref: string;
  includeSalary?: boolean;
}) {
  const [{ expenses, total }, categories] = await Promise.all([
    listExpenses({
      dateFrom,
      dateTo,
      categoryId,
      paymentMethod,
      search,
      includeSalary,
    }),
    listExpenseCategories(),
  ]);

  // Détail par article (ExpenseItem) des dépenses de la sélection : lib
  // reste volontairement sans `items` — on les charge ici directement, comme
  // le fait déjà l'export CSV (app/api/export/expense-items/route.ts).
  const expenseIds = expenses.map((e) => e.id);
  const items =
    expenseIds.length > 0
      ? await prisma.expenseItem.findMany({
          where: { expenseId: { in: expenseIds } },
          orderBy: { sortOrder: 'asc' },
          include: { article: { select: { id: true, name: true } } },
        })
      : [];
  const itemsByExpense = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByExpense.get(it.expenseId) ?? [];
    arr.push(it);
    itemsByExpense.set(it.expenseId, arr);
  }

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    receiptNo: e.receiptNo,
    date: formatLocalDateOnly(e.date),
    amount: e.amount,
    paymentLabel: PAYMENT_LABELS[e.paymentMethod] ?? e.paymentMethod,
    paymentMethod: e.paymentMethod,
    supplier: e.supplier,
    note: e.note,
    receiptUrl: e.receiptUrl,
    categoryId: e.category.id,
    categoryName: e.category.name,
    items: (itemsByExpense.get(e.id) ?? []).map((i) => ({
      id: i.id,
      articleId: i.articleId,
      articleName: i.article?.name ?? null,
      rawLabel: i.rawLabel,
      label: i.label,
      formatQty: i.formatQty?.toNumber() ?? null,
      formatSize: i.formatSize?.toNumber() ?? null,
      unit: i.unit,
      unitPrice: i.unitPrice,
      amount: i.amount,
      pendingQuantity: i.pendingQuantity,
    })),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">
          Historique
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {periodLabel}
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryFilter categories={categories} selected={categoryId ?? ''} />
          <ExpenseFilters payment={paymentMethod ?? ''} search={search ?? ''} />
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>
              <Download className="mr-1.5 h-4 w-4" />
              Exporter CSV
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ExpensesTable expenses={rows} categories={categories} total={total} />
      </CardContent>
    </Card>
  );
}
