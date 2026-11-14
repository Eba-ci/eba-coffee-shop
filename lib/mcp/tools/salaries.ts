// lib/mcp/tools/salaries.ts
//
// Outils MCP — salaires. Le DÉTAIL de la paie (employés, taux, versements,
// avances) est réservé à l'ADMIN (`scope: 'admin'` : invisible au MANAGER, au
// COMPTABLE et à l'ANALYSTE, et jamais exposé à l'assistant IA). Seul
// l'agrégat mensuel — UN nombre, sans employé — reste ouvert aux rôles
// finance (`scope: 'finance'`).
//
// Aucune logique propre : tout vient de `lib/salaries` (aucune duplication).

import { z } from 'zod';
import { getSalaryMonthView } from '@/lib/salaries/admin-queries';
import {
  listSalaryAdvances,
  listSalaryEmployees,
} from '@/lib/salaries/admin-lists';
import { getMonthlySalaryTotal } from '@/lib/salaries/queries';
import { isValidMonth } from '@/lib/salaries/month';
import type { McpTool } from './types';

const monthSchema = z
  .string()
  .refine(isValidMonth, 'Mois attendu au format YYYY-MM')
  .describe('Mois civil « YYYY-MM ».');

const monthInput = z.object({ month: monthSchema });

export const salariesTools: McpTool[] = [
  {
    name: 'get_salary_month_total',
    toolset: 'finance',
    scope: 'finance',
    title: 'Total des salaires du mois (agrégat)',
    description:
      'Renvoie UNIQUEMENT le total des salaires dus pour un mois civil ' +
      '(« YYYY-MM »), tous employés confondus : un nombre en FCFA, sans nom, ' +
      'sans effectif, sans ventilation. Ouvert aux rôles finance ; le DÉTAIL de ' +
      'la paie reste réservé à l’ADMIN.',
    inputSchema: monthInput,
    readOnly: true,
    handler: (args) => getMonthlySalaryTotal((args as { month: string }).month),
  },
  {
    name: 'get_salary_month_view',
    toolset: 'finance',
    scope: 'admin',
    title: 'Vue détaillée des salaires d’un mois (ADMIN)',
    description:
      'ADMIN uniquement. Détail par employé d’un mois civil : dû (taux ' +
      'proratisés, primes et retenues), salaires et acomptes versés, avances ' +
      'récupérées, reste à payer, arriéré des mois clôturés, montant proposé ' +
      'au paiement et solde d’avance, plus les totaux du mois. Données ' +
      'nominatives : jamais exposées aux autres rôles.',
    inputSchema: monthInput,
    readOnly: true,
    handler: (args) => getSalaryMonthView((args as { month: string }).month),
  },
  {
    name: 'list_salary_employees',
    toolset: 'finance',
    scope: 'admin',
    title: 'Lister les employés (ADMIN)',
    description:
      'ADMIN uniquement. Employés (nom, poste, entrée/sortie, actif, note), ' +
      'historique de leurs taux mensuels, primes/retenues et arriéré à ce ' +
      'jour. Données nominatives.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => listSalaryEmployees(),
  },
  {
    name: 'list_salary_advances',
    toolset: 'finance',
    scope: 'admin',
    title: 'Lister les avances sur salaire (ADMIN)',
    description:
      'ADMIN uniquement. Avances enregistrées (employé, date, mois, montant, ' +
      'étalement, note), les plus récentes d’abord.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => listSalaryAdvances(),
  },
];
