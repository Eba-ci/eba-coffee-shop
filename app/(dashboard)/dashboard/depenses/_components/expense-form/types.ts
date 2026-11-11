import type { ExpenseItemDraft } from '@/lib/expense-item-draft';
import type { ExpenseArticleOption } from '@/lib/expense-article-search';

export type Category = { id: string; name: string };

/** Référentiel d'articles pour la saisie — type canonique, source unique. */
export type ArticleOption = ExpenseArticleOption;

/** Ligne de détail en cours de saisie. */
export type ExpenseItemFormValues = ExpenseItemDraft;

export type ExpenseFormValues = {
  id?: string;
  date: string;
  amount: string;
  categoryId: string;
  paymentMethod: string;
  supplier: string;
  note: string;
  receiptUrl: string | null;
  /** Lignes de détail (vide = dépense simple, sans détail). */
  items: ExpenseItemFormValues[];
  /** Occurrence de charge fixe réglée par cette dépense (création seulement). */
  fixedCostId?: string | null;
  dueDate?: string | null;
};
