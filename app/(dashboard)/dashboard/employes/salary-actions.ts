'use server';

// Écritures de paie du module Employés (#450) : versements, avances, primes et
// retenues. Aucune logique métier ici — chaque action garde ADMIN puis délègue
// aux mutations existantes de `lib/salaries` (ledger et règles uniques).
//
// La garde est évaluée DANS le `run` pour renvoyer un message français au
// tiroir ; le refus reste serveur et précède toute écriture. Un COMPTABLE,
// qui consulte la Paie du mois, ne peut donc rien écrire même en rejouant
// l'appel.

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth-helpers';
import * as salaries from '@/lib/salaries/mutations';
import * as advances from '@/lib/salaries/advance-mutations';
import * as adjustments from '@/lib/salaries/adjustment-mutations';
import * as settle from '@/lib/salaries/settle-mutations';
import * as payroll from '@/lib/salaries/payroll-mutations';
import * as bonus from '@/lib/salaries/bonus-mutations';

export type SalaryActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<SalaryActionResult> {
  try {
    await requireAdmin();
    await fn();
    revalidatePath('/dashboard/employes', 'layout');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

// ── Versements (salaire / acompte / avance) ──

export async function recordSalaryPaymentAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => salaries.recordSalaryPayment(input));
}

// ── Avances : étalement, ajustement, annulation ──

export async function updateAdvanceRecoveryAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => advances.updateAdvanceRecovery(input));
}

export async function adjustSalaryAdvanceAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => advances.adjustSalaryAdvance(input));
}

export async function cancelSalaryAdvanceAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => advances.cancelSalaryAdvance(input));
}

// ── Primes et retenues ──

export async function createSalaryAdjustmentAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => adjustments.createSalaryAdjustment(input));
}

export async function cancelSalaryAdjustmentAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => adjustments.cancelSalaryAdjustment(input));
}

// ── Arriéré par lot et trop-perçu ──

export async function settleSalaryMonthsAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => settle.settleSalaryMonths(input));
}

export async function convertOverpaymentToBonusAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => bonus.convertOverpaymentToBonus(input));
}

export async function settlePayrollAction(
  input: unknown
): Promise<SalaryActionResult> {
  return run(() => payroll.settlePayroll(input));
}
