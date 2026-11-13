// lib/salaries/idempotency.ts
//
// Contrôle PUR d'idempotence d'un versement : une même `idempotencyKey` rejouée
// avec un contenu identique renvoie le versement existant, mais un contenu
// différent (employé, date, mois, montant ou type) est un CONFLIT — jamais un
// ancien versement servi à tort. La base n'est pas touchée ici.

import type { SalaryPaymentType } from '@/generated/prisma/enums';
import { SalaryIdempotencyConflictError } from './errors';

/** Contenu identitaire d'un versement, dates au format « YYYY-MM-DD ». */
export type SalaryPaymentIdentity = {
  employeeId: string;
  date: string;
  month: string;
  amount: number;
  type: SalaryPaymentType;
};

/** Deux versements portent-ils exactement le même contenu ? */
export function sameSalaryPayment(
  existing: SalaryPaymentIdentity,
  desired: SalaryPaymentIdentity
): boolean {
  return (
    existing.employeeId === desired.employeeId &&
    existing.date === desired.date &&
    existing.month === desired.month &&
    existing.amount === desired.amount &&
    existing.type === desired.type
  );
}

/**
 * Un versement existe déjà pour la clé : le renvoyer si le contenu est
 * identique, lever `SalaryIdempotencyConflictError` sinon.
 */
export function assertSameSalaryPayment(
  existing: SalaryPaymentIdentity,
  desired: SalaryPaymentIdentity
): void {
  if (sameSalaryPayment(existing, desired)) return;
  throw new SalaryIdempotencyConflictError(
    'Cette clé d’idempotence a déjà servi pour un versement différent.'
  );
}
