import { z } from 'zod';
import {
  EXPENSE_AMOUNT_MAX,
  EXPENSE_RECURRING_LABEL_MAX,
} from '@/config/constants';

export const FIXED_COST_PERIODICITIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const;

export const fixedCostPeriodicitySchema = z.enum(FIXED_COST_PERIODICITIES);

export const FIXED_COST_PERIODICITY_LABELS: Record<
  (typeof FIXED_COST_PERIODICITIES)[number],
  string
> = {
  DAILY: 'Par jour ouvré',
  WEEKLY: 'Par semaine',
  MONTHLY: 'Par mois',
  QUARTERLY: 'Par trimestre',
  YEARLY: 'Par an',
};

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD');

export const fixedCostObjectSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Libellé requis')
    .max(EXPENSE_RECURRING_LABEL_MAX, 'Libellé trop long'),
  amount: z
    .number()
    .int('Montant entier (FCFA)')
    .positive('Montant invalide')
    .max(EXPENSE_AMOUNT_MAX, 'Montant trop élevé'),
  periodicity: fixedCostPeriodicitySchema,
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  categoryId: z.string().min(1, 'Catégorie requise'),
  active: z.boolean().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

const endAfterStart = (v: { startDate?: string; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

/**
 * Création : périodicité mensuelle par défaut. Le défaut vit ICI et non dans
 * `fixedCostObjectSchema` : `.partial()` conserve un `.default()`, et une mise
 * à jour partielle (ex. `{ active: false }`) réécrirait alors la périodicité.
 */
export const fixedCostCreateObjectSchema = fixedCostObjectSchema.extend({
  periodicity: fixedCostPeriodicitySchema.default('MONTHLY'),
});

export const fixedCostInputSchema = fixedCostCreateObjectSchema.refine(
  endAfterStart,
  {
    message: 'La fin doit être après la prise d’effet',
    path: ['endDate'],
  }
);

export const fixedCostUpdateSchema = fixedCostObjectSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Au moins un champ à mettre à jour est requis',
  })
  .refine(endAfterStart, {
    message: 'La fin doit être après la prise d’effet',
    path: ['endDate'],
  });

export type FixedCostInput = z.infer<typeof fixedCostInputSchema>;
export type FixedCostUpdateInput = z.infer<typeof fixedCostUpdateSchema>;
export type FixedCostPeriodicityValue =
  (typeof FIXED_COST_PERIODICITIES)[number];
