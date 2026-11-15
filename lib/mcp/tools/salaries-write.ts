// lib/mcp/tools/salaries-write.ts
//
// Outils MCP — ÉCRITURES de paie (module Employés). `scope: 'admin'` : ADMIN
// seul, invisibles au MANAGER, au COMPTABLE et à l'ANALYSTE, jamais exposés à
// l'assistant IA ; la clé statique n'a pas ce scope. Les gardes serveur
// (`requireSalaryAdmin`) restent la source de vérité.
//
// Motif du projet : SIMULATION par défaut (rien n'est écrit), `confirmer: true`
// pour exécuter. Aucune logique propre : tout passe par `lib/salaries`.

import { z } from 'zod';
import {
  employeeCreateSchema,
  employeeExitSchema,
  employeeUpdateSchema,
  salaryAdjustmentCancelSchema,
  salaryAdjustmentCreateSchema,
  salaryPaymentCancelSchema,
  salaryPaymentCreateSchema,
  salaryPayrollSchema,
  salaryRateAddSchema,
} from '@/lib/schemas/salary';
import {
  cancelSalaryAdjustment,
  createSalaryAdjustment,
} from '@/lib/salaries/adjustment-mutations';
import { cancelSalaryPayment } from '@/lib/salaries/cancel-mutations';
import {
  createEmployee,
  recordSalaryPayment,
  updateEmployee,
} from '@/lib/salaries/mutations';
import { settlePayroll } from '@/lib/salaries/payroll-mutations';
import { addSalaryRate } from '@/lib/salaries/rate-mutations';
import type { McpTool } from './types';

const confirmer = z
  .object({
    confirmer: z
      .boolean()
      .optional()
      .describe(
        'false/absent = simulation (rien n’est écrit) ; true = exécute.'
      ),
  })
  .describe('Confirmation');

const DRY_RUN_MESSAGE =
  'Simulation : rien n’a été enregistré. Rappelez l’outil avec confirmer: true pour exécuter.';

/** Construit un outil d'écriture : simulation par défaut, `confirmer: true` exécute. */
function writeTool<S extends z.ZodType>(
  name: string,
  title: string,
  description: string,
  schema: S,
  run: (input: z.infer<S>) => Promise<unknown>
): McpTool {
  return {
    name,
    toolset: 'finance',
    scope: 'admin',
    title,
    description: `ADMIN uniquement (module Employés). ${description} Simulation par défaut ; passez confirmer: true pour exécuter. Données nominatives.`,
    inputSchema: schema.and(confirmer),
    readOnly: false,
    handler: async (args) => {
      const { confirmer: go, ...input } = args as {
        confirmer?: boolean;
      } & Record<string, unknown>;
      if (!go) return { dryRun: true, message: DRY_RUN_MESSAGE, input };
      return run(input as z.infer<S>);
    },
  };
}

const employeeChange = z.object({
  employeeId: z.string().min(1).describe('Identifiant de l’employé.'),
  changes: employeeUpdateSchema.describe('Champs à modifier.'),
});
const employeeExit = z.object({
  employeeId: z.string().min(1).describe('Identifiant de l’employé.'),
  endDate: employeeExitSchema.shape.endDate,
});

export const salariesWriteTools: McpTool[] = [
  writeTool(
    'create_salary_employee',
    'Créer un employé (ADMIN)',
    'Crée un employé (sans taux ; ajoutez-le avec add_salary_rate).',
    employeeCreateSchema,
    createEmployee
  ),
  writeTool(
    'update_salary_employee',
    'Modifier un employé (ADMIN)',
    'Modifie l’identité, les dates ou le statut d’un employé, sans toucher à ses taux ni à ses versements.',
    employeeChange,
    (i) => updateEmployee(i.employeeId, i.changes)
  ),
  writeTool(
    'record_salary_employee_exit',
    'Enregistrer la sortie d’un employé (ADMIN)',
    'Fixe la date de sortie : l’historique est conservé, l’employé quitte les listes actives.',
    employeeExit,
    (i) => updateEmployee(i.employeeId, { endDate: i.endDate })
  ),
  writeTool(
    'add_salary_rate',
    'Ajouter un taux de salaire (ADMIN)',
    'Ajoute un taux en MOIS ENTIERS (startMonth, endMonth facultatif) ; le taux en cours est fermé le mois précédent ; refusé si un mois déjà versé changerait.',
    salaryRateAddSchema,
    addSalaryRate
  ),
  writeTool(
    'record_salary_payment',
    'Enregistrer un versement (ADMIN)',
    'Enregistre un versement (SALAIRE, ACOMPTE ou AVANCE) ; la ligne globale « Masse salariale » du jour et du mode est recalculée.',
    salaryPaymentCreateSchema,
    recordSalaryPayment
  ),
  writeTool(
    'cancel_salary_payment',
    'Annuler un versement (ADMIN)',
    'Annule un versement sans le supprimer (motif obligatoire) ; refusé pour un versement en espèces si la caisse du jour est clôturée.',
    salaryPaymentCancelSchema,
    cancelSalaryPayment
  ),
  writeTool(
    'create_salary_adjustment',
    'Enregistrer une prime ou une retenue (ADMIN)',
    'Ajoute une prime ou une retenue datée, rattachée à un mois de paie.',
    salaryAdjustmentCreateSchema,
    createSalaryAdjustment
  ),
  writeTool(
    'cancel_salary_adjustment',
    'Annuler une prime ou une retenue (ADMIN)',
    'Annule un ajustement (conservé dans l’historique, sorti des calculs).',
    salaryAdjustmentCancelSchema,
    cancelSalaryAdjustment
  ),
  writeTool(
    'pay_salary_payroll',
    'Payer la masse salariale d’un mois (ADMIN)',
    'Paie plusieurs employés en un lot : un versement par employé, même date et même mode, UNE ligne de dépense globale ; montant ≤ reste à payer ; idempotent par idempotencyKey.',
    salaryPayrollSchema,
    settlePayroll
  ),
];
