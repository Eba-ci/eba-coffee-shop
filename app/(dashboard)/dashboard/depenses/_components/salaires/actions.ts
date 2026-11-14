'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth-helpers';
import * as salaries from '@/lib/salaries/mutations';
import * as advances from '@/lib/salaries/advance-mutations';
import * as adjustments from '@/lib/salaries/adjustment-mutations';

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Garde ADMIN explicite sur CHAQUE action de l'écran Salaires (et non
 * `requireFinance`, car la page Dépenses est ouverte à MANAGER/COMPTABLE
 * depuis #420). Un non-admin est arrêté ici, avant toute mutation.
 */
async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath('/dashboard/depenses');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}

// ── Employés ──

export async function createEmployeeAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => salaries.createEmployee(input));
}

export async function updateEmployeeAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => salaries.updateEmployee(id, input));
}

// ── Historique des taux ──

export async function setSalaryRateAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => salaries.setSalaryRate(input));
}

// ── Versements (salaire / acompte / avance) ──

export async function recordSalaryPaymentAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => salaries.recordSalaryPayment(input));
}

// ── Avances : étalement, ajustement, annulation ──

export async function updateAdvanceRecoveryAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => advances.updateAdvanceRecovery(input));
}

export async function adjustSalaryAdvanceAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => advances.adjustSalaryAdvance(input));
}

export async function cancelSalaryAdvanceAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => advances.cancelSalaryAdvance(input));
}

// ── Primes et retenues (#443) ──

export async function createSalaryAdjustmentAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => adjustments.createSalaryAdjustment(input));
}

export async function cancelSalaryAdjustmentAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  return run(() => adjustments.cancelSalaryAdjustment(input));
}
