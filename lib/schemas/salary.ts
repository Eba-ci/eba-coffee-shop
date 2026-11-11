import { z } from 'zod';
import {
  EXPENSE_AMOUNT_MAX,
  SALARY_NAME_MAX,
  SALARY_NOTE_MAX,
  SALARY_POSITION_MAX,
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
  message: 'La sortie doit être après l’entrée',
  path: ['endDate'],
});

export const employeeUpdateSchema = employeeObjectSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Au moins un champ à mettre à jour est requis',
  })
  .refine(endAfterStart, {
    message: 'La sortie doit être après l’entrée',
    path: ['endDate'],
  });

export const salaryRateCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employé requis'),
  monthlyAmount: amountSchema,
  startDate: dateOnly,
});

export const salaryPaymentCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employé requis'),
  date: dateOnly,
  month: monthSchema,
  amount: amountSchema,
  type: salaryPaymentTypeSchema,
  paymentMethod: expensePaymentMethodSchema.optional(),
  recoveryMonths: z.number().int().min(1).max(60).optional(),
  note: z.string().trim().max(SALARY_NOTE_MAX).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type SalaryRateCreateInput = z.infer<typeof salaryRateCreateSchema>;
export type SalaryPaymentCreateInput = z.infer<
  typeof salaryPaymentCreateSchema
>;
export type SalaryPaymentTypeValue = (typeof SALARY_PAYMENT_TYPES)[number];
