// Schémas Zod du suivi des dépenses. `expenseInputSchema` reste un `z.object` SANS `.refine()` racine (Zod 4 interdit `.partial()` sinon, cf. MCP). Implémentation dans `lib/schemas/expense/`.

export {
  expenseNatureSchema,
  expenseCategoryInputSchema,
  expenseCategoryUpdateSchema,
} from './expense/category';
export type {
  ExpenseNatureInput,
  ExpenseCategoryInput,
  ExpenseCategoryUpdateInput,
} from './expense/category';
export { expensePaymentMethodSchema } from './expense/common';
export type { ExpensePaymentMethodInput } from './expense/common';
export {
  expenseItemInputSchema,
  resolveExpenseItemAmount,
} from './expense/item';
export type { ExpenseItemInput } from './expense/item';
export {
  expenseInputSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseFiltersSchema,
  expenseFrequencyFiltersSchema,
} from './expense/expense';
export type {
  ExpenseInput,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ExpenseFiltersInput,
  ExpenseFrequencyFiltersInput,
} from './expense/expense';
export {
  expenseArticleRenameSchema,
  expenseArticleSettingsSchema,
  articleMergeSchema,
  relinkExpenseItemSchema,
} from './expense/article';
export type {
  ExpenseArticleRenameInput,
  ExpenseArticleSettingsInput,
  ArticleMergeInput,
  RelinkExpenseItemInput,
} from './expense/article';
