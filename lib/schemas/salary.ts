import { z } from 'zod';
import {
  EXPENSE_AMOUNT_MAX,
  SALARY_ADJUSTMENT_AMOUNT_MAX,
  SALARY_ADJUSTMENT_NOTE_MAX,
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

/** Date obligatoire : vide → message dédié (plus lisible que le format). */
const requiredDateOnly = (requiredMessage: string) =>
  z
    .string()
    .min(1, requiredMessage)
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

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

export const employeeCreateSchema = employeeObjectSchema
  .extend({
    /** Salaire mensuel actuel (FCFA) : crée le premier taux avec l'employé. */
    monthlyAmount: amountSchema.nullable().optional(),
    /** Date d'effet du taux ; par défaut, la date d'entrée. */
    rateStartDate: dateOnly.nullable().optional(),
  })
  .refine(endAfterStart, {
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

/**
 * Taux depuis la fiche employé : des MOIS ENTIERS (début le 1er, fin le dernier
 * jour du mois ; fin vide = en cours). Jamais d'écrasement ni de chevauchement
 * (voir `rate-mutations.ts`). Messages dédiés pour rester lisibles dans le tiroir.
 */
const rateFields = {
  monthlyAmount: z
    .number({ error: 'Montant requis' })
    .int('Montant entier (FCFA)')
    .positive('Le taux doit être un montant positif')
    .max(EXPENSE_AMOUNT_MAX, 'Montant trop élevé'),
  startMonth: z
    .string()
    .min(1, 'Mois de début requis')
    .refine(isValidMonth, 'Mois attendu au format YYYY-MM'),
  endMonth: z
    .string()
    .refine(isValidMonth, 'Mois attendu au format YYYY-MM')
    .nullable()
    .optional()
    .transform((v) => v ?? null),
};

export const salaryRateAddSchema = z.object({
  employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
  ...rateFields,
});

export const salaryRateUpdateSchema = z.object({
  rateId: z.string().min(SALARY_ID_MIN_LENGTH, 'Taux requis'),
  ...rateFields,
});

export const salaryRateDeleteSchema = z.object({
  rateId: z.string().min(SALARY_ID_MIN_LENGTH, 'Taux requis'),
});

/** « Enregistrer une sortie » : la date est obligatoire. */
export const employeeExitSchema = z.object({
  endDate: requiredDateOnly('Date de sortie requise'),
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
export type EmployeeExitInput = z.infer<typeof employeeExitSchema>;
export type SalaryRateCreateInput = z.infer<typeof salaryRateCreateSchema>;
export type SalaryRateAddInput = z.infer<typeof salaryRateAddSchema>;
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

// ── Primes et retenues (#443) ──
//
// Montant toujours POSITIF : la nature porte le signe. Un ajustement n'est
// jamais supprimé, seulement annulé (`canceledAt`) pour garder l'historique.

export const SALARY_ADJUSTMENT_NATURES = ['PRIME', 'RETENUE'] as const;

export const salaryAdjustmentNatureSchema = z.enum(SALARY_ADJUSTMENT_NATURES);

export const SALARY_ADJUSTMENT_NATURE_LABELS: Record<
  (typeof SALARY_ADJUSTMENT_NATURES)[number],
  string
> = {
  PRIME: 'Prime',
  RETENUE: 'Retenue',
};

export const salaryAdjustmentCreateSchema = z.object({
  employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
  month: monthSchema,
  date: dateOnly,
  nature: salaryAdjustmentNatureSchema,
  amount: z
    .number()
    .int('Montant entier (FCFA)')
    .positive('Montant invalide')
    .max(SALARY_ADJUSTMENT_AMOUNT_MAX, 'Montant trop élevé'),
  note: z.string().trim().max(SALARY_ADJUSTMENT_NOTE_MAX).nullable().optional(),
});

export const salaryAdjustmentCancelSchema = z.object({
  adjustmentId: z.string().min(SALARY_ID_MIN_LENGTH, 'Ajustement requis'),
});

export type SalaryAdjustmentCreateInput = z.infer<
  typeof salaryAdjustmentCreateSchema
>;
export type SalaryAdjustmentCancelInput = z.infer<
  typeof salaryAdjustmentCancelSchema
>;
export type SalaryAdjustmentNatureValue =
  (typeof SALARY_ADJUSTMENT_NATURES)[number];

// ── Règlement d'arriéré par lot (ADMIN seul) ──
//
// Un geste règle plusieurs mois d'un employé : un versement SALAIRE par mois,
// à la date choisie (par défaut le 1er du mois suivant le mois couvert), tous au
// même mode de paiement, dans UNE transaction.

export const SALARY_SETTLE_MONTHS_MAX = 36;

export const salarySettleItemSchema = z.object({
  month: monthSchema,
  date: dateOnly,
  amount: amountSchema,
});

export const salarySettleSchema = z
  .object({
    employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
    paymentMethod: expensePaymentMethodSchema.default('WAVE'),
    note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(SALARY_IDEMPOTENCY_KEY_MIN)
      .max(SALARY_IDEMPOTENCY_KEY_MAX),
    items: z.array(salarySettleItemSchema).min(1).max(SALARY_SETTLE_MONTHS_MAX),
  })
  .refine((v) => new Set(v.items.map((i) => i.month)).size === v.items.length, {
    message: 'Un mois ne peut être réglé qu’une fois par lot',
  });

export type SalarySettleInput = z.infer<typeof salarySettleSchema>;

// ── Paie de toute la masse salariale d'un mois (ADMIN seul) ──
//
// Un geste règle le mois choisi pour plusieurs employés : un versement SALAIRE
// par employé, même date, même mode, une transaction, UNE ligne de dépense.

export const SALARY_PAYROLL_EMPLOYEES_MAX = 200;

export const salaryPayrollSchema = z
  .object({
    month: monthSchema,
    date: dateOnly,
    paymentMethod: expensePaymentMethodSchema.default('WAVE'),
    note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(SALARY_IDEMPOTENCY_KEY_MIN)
      .max(SALARY_IDEMPOTENCY_KEY_MAX),
    items: z
      .array(
        z.object({
          employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
          amount: amountSchema,
        })
      )
      .min(1)
      .max(SALARY_PAYROLL_EMPLOYEES_MAX),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.employeeId)).size === v.items.length,
    { message: 'Un employé ne peut être payé qu’une fois par lot' }
  );

export type SalaryPayrollInput = z.infer<typeof salaryPayrollSchema>;

/** Trop-perçu d'un mois converti en prime (« bonus »). */
export const salaryBonusFromOverpaymentSchema = z.object({
  employeeId: z.string().min(SALARY_ID_MIN_LENGTH, 'Employé requis'),
  month: monthSchema,
});
