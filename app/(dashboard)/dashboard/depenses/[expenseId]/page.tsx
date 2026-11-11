import { notFound } from 'next/navigation';
import { requireFinance } from '@/lib/auth-helpers';
import { getExpenseForEdit, listExpenseCategories } from '@/lib/expenses';
import { BackButton } from '@/components/(dashboard)/back-button';
import { ExpenseForm } from '../expense-form';
import { expenseToFormValues } from '../expense-form-values';
import { loadArticleOptions } from '../_components/article-options';

// Page d'administration : données live, jamais prérendue.
export const dynamic = 'force-dynamic';

export default async function ModifierDepensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  const [, expense, categories, articles] = await Promise.all([
    requireFinance(),
    getExpenseForEdit(expenseId),
    listExpenseCategories(),
    loadArticleOptions(),
  ]);
  if (!expense) notFound();
  // Ligne de salaire : pilotée par le module salaires, jamais éditée ici.
  if (expense.salaryPaymentId) notFound();

  const plainCategories = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div>
        <BackButton
          fallbackHref="/dashboard/depenses"
          label="Dépenses"
          className="-ml-3 mb-2"
        />
        <h1 className="text-2xl font-bold">Modifier la dépense</h1>
      </div>
      <ExpenseForm
        categories={plainCategories}
        articles={articles}
        mode="edit"
        initial={expenseToFormValues(expense, 'edit')}
      />
    </div>
  );
}
