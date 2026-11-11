import { requireFinance } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { getExpenseForEdit, listExpenseCategories } from '@/lib/expenses';
import { todayDateString } from '@/lib/timezone';
import { BackButton } from '@/components/(dashboard)/back-button';
import { ExpenseForm } from '../expense-form';
import { emptyExpense, expenseToFormValues } from '../expense-form-values';
import { loadArticleOptions } from '../_components/article-options';

// Page d'administration : données live, jamais prérendue.
export const dynamic = 'force-dynamic';

export default async function NouvelleDepensePage({
  searchParams,
}: {
  searchParams: Promise<{
    dupliquer?: string;
    recurrent?: string;
    chargefixe?: string;
  }>;
}) {
  const { dupliquer, recurrent, chargefixe } = await searchParams;
  const [, categories, articles] = await Promise.all([
    requireFinance(),
    listExpenseCategories(),
    loadArticleOptions(),
  ]);

  const plainCategories = categories.map((c) => ({ id: c.id, name: c.name }));
  let initial = emptyExpense(plainCategories);
  let subtitle: string | null = null;

  // Pré-remplissages optionnels. Une référence introuvable n'est pas une
  // erreur : on retombe simplement sur un formulaire vierge.
  if (dupliquer) {
    const source = await getExpenseForEdit(dupliquer);
    if (source) {
      initial = expenseToFormValues(source, 'duplicate');
      subtitle = 'Copie d’une dépense existante, à la date du jour.';
    }
  } else if (recurrent) {
    const template = await prisma.recurringExpense.findUnique({
      where: { id: recurrent },
      select: { label: true, categoryId: true, expectedAmount: true },
    });
    if (template) {
      initial = {
        ...initial,
        date: todayDateString(),
        categoryId: template.categoryId,
        amount: template.expectedAmount ? String(template.expectedAmount) : '',
        note: template.label,
      };
      subtitle = `Dépense récurrente « ${template.label} », pré-remplie d’après le modèle.`;
    }
  } else if (chargefixe) {
    const fixed = await prisma.fixedCost.findUnique({
      where: { id: chargefixe },
      select: { label: true, categoryId: true, amount: true },
    });
    if (fixed) {
      initial = {
        ...initial,
        date: todayDateString(),
        categoryId: fixed.categoryId,
        amount: String(fixed.amount),
        note: fixed.label,
      };
      subtitle = `Charge fixe « ${fixed.label} », pré-remplie d’après la liste du point mort.`;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton
          fallbackHref="/dashboard/depenses"
          label="Dépenses"
          className="-ml-3 mb-2"
        />
        <h1 className="text-2xl font-bold">Nouvelle dépense</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <ExpenseForm
        categories={plainCategories}
        articles={articles}
        mode="create"
        initial={initial}
      />
    </div>
  );
}
