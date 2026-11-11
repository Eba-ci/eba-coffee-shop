import { requireFinance } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { getExpenseForEdit, listExpenseCategories } from '@/lib/expenses';
import { getFixedCostOccurrence } from '@/lib/fixed-costs/queries';
import { formatDay } from '@/lib/fixed-costs/format';
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
    echeance?: string;
    mois?: string;
  }>;
}) {
  const { dupliquer, recurrent, chargefixe, echeance, mois } =
    await searchParams;
  const [, categories, articles] = await Promise.all([
    requireFinance(),
    listExpenseCategories(),
    loadArticleOptions(),
  ]);

  const plainCategories = categories.map((c) => ({ id: c.id, name: c.name }));
  let initial = emptyExpense(plainCategories);
  let subtitle: string | null = null;
  // Après enregistrement, on revient au calendrier des paiements du mois.
  let cancelHref = '/dashboard/depenses';

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
      const occurrence =
        echeance && DATE_ONLY_RE.test(echeance)
          ? await getFixedCostOccurrence(chargefixe, echeance)
          : null;
      // Reste à payer pré-rempli, jamais `remaining || amount` : une échéance
      // entièrement réglée (remaining = 0) ne doit pas rouvrir un montant.
      const prefill = occurrence
        ? occurrence.remaining > 0
          ? String(occurrence.remaining)
          : ''
        : String(fixed.amount);
      initial = {
        ...initial,
        date: todayDateString(),
        categoryId: fixed.categoryId,
        amount: prefill,
        note: fixed.label,
        fixedCostId: chargefixe,
        dueDate: occurrence?.dueDate ?? echeance ?? null,
      };
      subtitle = occurrence
        ? `Règlement de « ${fixed.label} », échéance du ${formatDay(occurrence.dueDate)}.`
        : `Charge fixe « ${fixed.label} », pré-remplie.`;
      cancelHref = `/dashboard/depenses?tab=paiements${
        mois && MONTH_RE.test(mois) ? `&mois=${mois}` : ''
      }`;
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
        cancelHref={cancelHref}
      />
    </div>
  );
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
