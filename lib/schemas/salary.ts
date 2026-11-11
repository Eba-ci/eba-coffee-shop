import { z } from 'zod';
import {
  EXPENSE_AMOUNT_MAX,
  SALARY_END_AFTER_START_MESSAGE,
  SALARY_IDEMPOTENCY_KEY_MAX,
  SALARY_IDEMPOTENCY_KEY_MIN,
  SALARY_ID_MIN_LENGTH,
  SALARY_NAME_MAX,
  SALARY_NOTE_MAX,
  SALARY_POSITION_MAX,
  SALARY_RECOVERY_MONTHS_MAX,
  SALARY_RECOVERY_MONTHS_MIN,
} from '@/config/constants';
import { dateOnly, expensePaymentMethodSchema } from './expense/common';
import { isValidMonth } from '@/lib/salaries/month';

export const SALARY_PAYMENT_TYPES = ['SALAIRE', 'ACOMPTE', 'AVANCE'] as const;

export const salaryPaymentTypeSchema = z.enum(SALARY_PAYMENT_TYPES);

export const SALARY_PAYMENT_TYPE_LABELS: Record<
  (typeof SALARY_PAYMENT_TYPES)[number],
  string
> = {
  SALAIRE: 'Salaire',
  ACOMPTE: 'Acompte',
  AVANCE: 'Avance',
};

const monthSchema = z
  .string()
  .refine(isValidMonth, 'Mois attendu au format YYYY-MM');

const amountSchema = z
  .number()
  .int('Montant entier (FCFA)')
  .positive('Montant invalide')
  .max(EXPENSE_AMOUNT_MAX, 'Montant trop élevé');

const employeeObjectSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(SALARY_NAME_MAX),
  position: z.string().trim().max(SALARY_POSITION_MAX).nullable().optional(),
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
});

const endAfterStart = (v: { startDate?: string; endDate?: string | null }) =>
  !v.endDate || !v.startDate || v.endDate >= v.startDate;

export const employeeCreateSchema = employeeObjectSchema.refine(endAfterStart, {
  message: SALARY_END_AFTER_START_MESSAGE,
  path: ['endDate'],
});

export const employeeUpdateSchema = employeeObjectSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Au moins un champ à mettre à jour est requis',
  })
  .refine(endAfterStart, {
    message: SALARY_END_AFTER_START_MESSAGE,
    path: ['endDate'],
  });

export const salaryRateCreateSchema = z.object({
  employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
  monthlyAmount: amountSchema,
  startDate: dateOnly,
});

// Champs communs à la création et à la mise à jour d'un versement. Le défaut
// du mode de paiement (WAVE) vit dans `salaryPaymentCreateSchema` : en pratique
// on règle par Wave, et un versement espèces est un cas explicite (il sort du
// tiroir à la clôture). Pas de migration pour changer le défaut en base.
const salaryPaymentObjectSchema = z.object({
  employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
  date: dateOnly,
  month: monthSchema,
  amount: amountSchema,
  type: salaryPaymentTypeSchema,
  paymentMethod: expensePaymentMethodSchema.optional(),
  recoveryMonths: z
    .number()
    .int()
    .min(SALARY_RECOVERY_MONTHS_MIN)
    .max(SALARY_RECOVERY_MONTHS_MAX)
    .optional(),
  note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
});

export const salaryPaymentCreateSchema = salaryPaymentObjectSchema.extend({
  paymentMethod: expensePaymentMethodSchema.default('WAVE'),
  idempotencyKey: z
    .string()
    .trim()
    .min(SALARY_IDEMPOTENCY_KEY_MIN)
    .max(SALARY_IDEMPOTENCY_KEY_MAX)
    .optional(),
});

export const salaryPaymentUpdateSchema = salaryPaymentObjectSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Au moins un champ à mettre à jour est requis',
  });

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type SalaryRateCreateInput = z.infer<typeof salaryRateCreateSchema>;
export type SalaryPaymentCreateInput = z.infer<
  typeof salaryPaymentCreateSchema
>;
export type SalaryPaymentUpdateInput = z.infer<
  typeof salaryPaymentUpdateSchema
>;
export type SalaryPaymentTypeValue = (typeof SALARY_PAYMENT_TYPES)[number];

// ── Avances : étalement, ajustement, annulation (ADMIN seul) ──
//
// Une AVANCE est un prêt récupéré sur les paies suivantes. Ces schémas
// couvrent les corrections demandées par la revue de #419 : modifier son
// étalement, ajuster son contenu, ou l'annuler. Chaque mutation est idempotente
// (rejouer la même opération laisse l'état inchangé).

/** Nouvel étalement (`recoveryMonths`) d'une avance existante. */
export const salaryAdvanceRecoverySchema = z.object({
  paymentId: z.string().min(SALARY_ID_MIN_LENGTH, 'Avance requise'),
  recoveryMonths: z
    .number()
    .int()
    .min(SALARY_RECOVERY_MONTHS_MIN)
    .max(SALARY_RECOVERY_MONTHS_MAX),
});

/** Ajustement du contenu d'une avance (au moins un champ). */
export const salaryAdvanceAdjustSchema = z
  .object({
    paymentId: z.string().min(SALARY_ID_MIN_LENGTH, 'Avance requise'),
    amount: amountSchema.optional(),
    date: dateOnly.optional(),
    month: monthSchema.optional(),
    paymentMethod: expensePaymentMethodSchema.optional(),
    note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
  })
  .refine(
    (v) =>
      v.amount !== undefined ||
      v.date !== undefined ||
      v.month !== undefined ||
      v.paymentMethod !== undefined ||
      v.note !== undefined,
    { message: 'Au moins un champ à ajuster est requis' }
  );

/** Annulation d'une avance. */
export const salaryAdvanceCancelSchema = z.object({
  paymentId: z.string().min(SALARY_ID_MIN_LENGTH, 'Avance requise'),
});

export type SalaryAdvanceRecoveryInput = z.infer<
  typeof salaryAdvanceRecoverySchema
>;
export type SalaryAdvanceAdjustInput = z.infer<
  typeof salaryAdvanceAdjustSchema
>;
export type SalaryAdvanceCancelInput = z.infer<
  typeof salaryAdvanceCancelSchema
>;
