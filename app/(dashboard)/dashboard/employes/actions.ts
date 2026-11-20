'use server';

// Écritures des employés et de leurs taux (#441). Aucune logique métier ici :
// chaque action garde ADMIN puis délègue aux mutations existantes de
// `lib/salaries` (aucune duplication du ledger ni des règles de paie).
//
// La garde est évaluée DANS le `run` pour que le tiroir reçoive un message
// français (« Non autorisé ») au lieu d'une promesse rejetée côté client ; le
// refus reste serveur et précède toute écriture.

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { requireAdmin } from '@/lib/auth-helpers';
import { employeeExitSchema, salaryRateAddSchema } from '@/lib/schemas/salary';
import {
  addSalaryRate,
  deleteSalaryRate,
  updateSalaryRate,
} from '@/lib/salaries/rate-mutations';
import { createEmployee, updateEmployee } from '@/lib/salaries/mutations';

export type EmployeActionResult = { ok: true } | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues[0]?.message ?? 'Données invalides';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Erreur inattendue';
}

async function run(fn: () => Promise<unknown>): Promise<EmployeActionResult> {
  try {
    await requireAdmin();
    await fn();
    // Une seule invalidation : la liste et les fiches vivent sous ce segment.
    revalidatePath('/dashboard/employes', 'layout');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Création d'un employé, avec un premier taux optionnel (même écriture). */
export async function createEmployeeAction(
  input: unknown
): Promise<EmployeActionResult> {
  return run(() => createEmployee(input));
}

/** Édition de l'identité et du poste : ni les taux ni les versements. */
export async function updateEmployeeIdentityAction(
  id: string,
  input: unknown
): Promise<EmployeActionResult> {
  return run(() => updateEmployee(id, input));
}

/**
 * Enregistre une sortie : date de sortie + employé inactif. L'historique
 * (taux, versements, arriéré) reste intact — aucune suppression.
 */
export async function recordEmployeeExitAction(
  id: string,
  input: unknown
): Promise<EmployeActionResult> {
  return run(async () => {
    const { endDate } = employeeExitSchema.parse(input);
    await updateEmployee(id, { endDate, active: false });
  });
}

/** Taux en mois entiers : jamais de chevauchement ni de mois déjà versé touché. */
export async function addSalaryRateAction(
  input: unknown
): Promise<EmployeActionResult> {
  return run(() => {
    salaryRateAddSchema.parse(input);
    return addSalaryRate(input);
  });
}

export async function updateSalaryRateAction(
  input: unknown
): Promise<EmployeActionResult> {
  return run(() => updateSalaryRate(input));
}

export async function deleteSalaryRateAction(
  input: unknown
): Promise<EmployeActionResult> {
  return run(() => deleteSalaryRate(input));
}

/**
 * Réactivation (#466) : l'employé redevient actif et sa date de sortie est
 * effacée. Aucune donnée n'est supprimée — l'historique reste intact.
 */
export async function reactivateEmployeeAction(
  id: string
): Promise<EmployeActionResult> {
  return run(() => updateEmployee(id, { active: true, endDate: null }));
}
