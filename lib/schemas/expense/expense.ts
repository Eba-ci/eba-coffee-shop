import { z } from 'zod';
import {
  EXPENSE_SUPPLIER_MAX,
  EXPENSE_NOTE_MAX,
  EXPENSE_AMOUNT_MAX,
} from '@/config/constants';
import { imageUrlSchema } from '@/lib/schemas/upload';
import { expensePaymentMethodSchema, dateOnly } from './common';
import { expenseItemsArraySchema } from './item';

// Pas de `.refine()` racine : Zod 4 interdit `.partial()` sur un schéma raffiné (utilisé par le MCP).
export const expenseInputSchema = z.object({
  date: dateOnly,
  amount: z
    .number()
    .int('Montant entier (FCFA)')
    .positive('Montant invalide')
    .max(EXPENSE_AMOUNT_MAX, 'Montant trop élevé'),
  categoryId: z.string().min(1, 'Catégorie requise'),
  paymentMethod: expensePaymentMethodSchema.optional(),
  supplier: z
    .string()
    .trim()
    .max(EXPENSE_SUPPLIER_MAX, 'Fournisseur trop long')
    .nullable()
    .optional(),
  note: z
    .string()
    .trim()
    .max(EXPENSE_NOTE_MAX, 'Note trop longue')
    .nullable()
    .optional(),
  receiptUrl: imageUrlSchema.nullable().optional(),
  items: expenseItemsArraySchema.nullable().optional(),
  /** Charge fixe réglée par cette dépense (occurrence liée). */
  fixedCostId: z.string().min(1).nullable().optional(),
  /** Jour d'échéance de l'occurrence réglée (`fixedCostId` + `dueDate`). */
  dueDate: dateOnly.nullable().optional(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * Liaison à une occurrence de charge fixe : `fixedCostId` et `dueDate` vont
 * ensemble (les deux, ou aucun). Le refine vit ICI et non sur
 * `expenseInputSchema` : Zod 4 interdit `.partial()` sur un schéma raffiné,
 * or le MCP s'en sert pour `update_expense`.
 */
const linkedOccurrence = (v: {
  fixedCostId?: string | null;
  dueDate?: string | null;
}) => (v.fixedCostId == null) === (v.dueDate == null);

export const expenseCreateSchema = expenseInputSchema.refine(linkedOccurrence, {
  message:
    'fixedCostId et dueDate doivent être fournis ensemble (les deux ou aucun).',
  path: ['dueDate'],
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const expenseUpdateSchema = expenseInputSchema
  .partial()
  // La liaison à une occurrence (fixedCostId/dueDate) se pose à la CRÉATION et
  // n'est jamais modifiée : `updateExpense` l'ignorait déjà. On la retire du
  // schéma de mise à jour pour que l'outil MCP ne l'annonce plus.
  .omit({ fixedCostId: true, dueDate: true })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Au moins un champ à mettre à jour est requis',
  });

export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

// Filtres de liste (plage de jours civils + catégorie + paiement + recherche).
export const expenseFiltersSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  categoryId: z.string().min(1).optional(),
  paymentMethod: expensePaymentMethodSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export type ExpenseFiltersInput = z.infer<typeof expenseFiltersSchema>;

// Filtres des stats de fréquence d'achat par article (défaut : mois civil en
// cours, appliqué par l'appelant — `search` matche le nom d'article).
export const expenseFrequencyFiltersSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().min(1).optional(),
});

export type ExpenseFrequencyFiltersInput = z.infer<
  typeof expenseFrequencyFiltersSchema
>;
