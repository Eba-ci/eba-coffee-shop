// lib/mcp/tools/fixed-costs.ts
//
// Outils MCP — charges fixes et point mort. Aucune logique propre : tout vient
// de lib/fixed-costs (calcul pur + requêtes).

import { z } from 'zod';
import {
  createFixedCost,
  deleteFixedCost,
  syncFixedCostsFromRecurring,
  updateFixedCost,
} from '@/lib/fixed-costs/mutations';
import {
  getBreakEvenReport,
  getLateFixedCostOccurrences,
  getMonthSchedule,
  listFixedCosts,
} from '@/lib/fixed-costs/queries';
import {
  fixedCostInputSchema,
  fixedCostCreateObjectSchema,
  fixedCostObjectSchema,
} from '@/lib/schemas/fixed-cost';
import { todayDateString } from '@/lib/timezone';
import { idSchema, rangeSchema } from './helpers';
import type { McpTool } from './types';

export const fixedCostsTools: McpTool[] = [
  {
    name: 'list_fixed_costs',
    toolset: 'finance',
    scope: 'finance',
    title: 'Lister les charges fixes',
    description:
      'Renvoie les charges fixes suivies pour le point mort (loyer, abonnements…) : ' +
      'montant par période, périodicité (DAILY/WEEKLY/MONTHLY/QUARTERLY/YEARLY), ' +
      'prise d’effet, fin éventuelle, catégorie de dépense attendue, et ' +
      '`installments` (échéances de paiement dans la période ; vide = une échéance ' +
      'par défaut déduite de la prise d’effet). Les salaires n’y figurent pas : ' +
      'ils sont gérés à part, en ADMIN seul.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => listFixedCosts(),
  },
  {
    name: 'create_fixed_cost',
    toolset: 'finance',
    scope: 'finance',
    title: 'Créer une charge fixe',
    description:
      'Ajoute une charge fixe : `amount` (FCFA entiers) couvre une période ' +
      '(`periodicity`), répartie sur les JOURS OUVRÉS (horaires de la boutique). ' +
      '`startDate` = prise d’effet (YYYY-MM-DD), `categoryId` = catégorie de ' +
      'dépense attendue. `installments` (optionnel) pose les échéances de paiement ' +
      'dans la période ([{ monthOffset, day, amount }], mois 0..N-1 de la période, ' +
      'jour 1..31 clampé) ; le TOTAL des échéances doit égaler `amount`. Vide = ' +
      'échéance par défaut (jour de la prise d’effet) ; refusé sur une charge DAILY.',
    inputSchema: fixedCostCreateObjectSchema,
    readOnly: false,
    handler: (args) => createFixedCost(fixedCostInputSchema.parse(args)),
  },
  {
    name: 'update_fixed_cost',
    toolset: 'finance',
    scope: 'finance',
    title: 'Modifier une charge fixe',
    description:
      'Mise à jour PARTIELLE d’une charge fixe : ne fournis que les champs à ' +
      'modifier. `installments` remplace toutes les échéances (`[]` = retour à ' +
      'l’échéance par défaut) — omis = inchangé ; le total des échéances finales ' +
      'doit égaler le montant final.',
    inputSchema: fixedCostObjectSchema.partial().extend({ id: idSchema }),
    readOnly: false,
    handler: (args) => {
      const { id, ...rest } = args as { id: string } & Record<string, unknown>;
      return updateFixedCost(id, rest);
    },
  },
  {
    name: 'delete_fixed_cost',
    toolset: 'finance',
    scope: 'finance',
    title: 'Supprimer une charge fixe',
    description:
      'Supprime définitivement une charge fixe. Action irréversible.',
    inputSchema: z.object({ id: idSchema }),
    readOnly: false,
    handler: (args) => deleteFixedCost((args as { id: string }).id),
  },
  {
    name: 'sync_fixed_costs_from_recurring',
    toolset: 'finance',
    scope: 'finance',
    title: 'Importer les récurrentes comme charges fixes',
    description:
      'Crée une charge fixe mensuelle pour chaque dépense récurrente ACTIVE qui ' +
      'n’en a pas encore (idempotent, ne modifie jamais une charge déjà liée). ' +
      'Les récurrentes sans montant attendu sont listées sans être créées.',
    inputSchema: z.object({}),
    readOnly: false,
    handler: () => syncFixedCostsFromRecurring(),
  },
  {
    name: 'get_break_even',
    toolset: 'finance',
    scope: 'finance',
    title: 'Point mort journalier',
    description:
      'Renvoie, jour par jour sur la plage, les charges fixes (réparties sur les ' +
      'jours ouvrés : 0 un jour fermé), le point mort en CA (charges ÷ taux de ' +
      'marge des 30 derniers jours), le CA net, le reste à faire et le résultat. ' +
      '`salaryTotal` = total GLOBAL des salaires du mois (un seul nombre, sans ' +
      'employé), lissé comme une charge. `margin.rate` null = marge non ' +
      'calculable (coûts de revient manquants).',
    inputSchema: rangeSchema,
    readOnly: true,
    handler: (args) => {
      const { from, to } = args as { from: string; to: string };
      return getBreakEvenReport(from <= to ? from : to, from <= to ? to : from);
    },
  },
  {
    name: 'get_fixed_cost_schedule',
    toolset: 'finance',
    scope: 'finance',
    title: 'Échéancier des charges fixes d’un mois',
    description:
      'Échéances d’un mois civil (`month` « YYYY-MM », défaut = mois en cours) : ' +
      'date d’échéance, montant, payé, reste et statut UPCOMING/PAID/PARTIAL/LATE ' +
      '(en retard = date passée et pas entièrement réglée, partielle comprise). ' +
      'Les occurrences sont calculées à la lecture ; les charges DAILY (par jour ' +
      'ouvré) n’ont pas d’échéance.',
    inputSchema: z.object({
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format YYYY-MM')
        .optional(),
    }),
    readOnly: true,
    handler: (args) => {
      const month =
        (args as { month?: string }).month ?? todayDateString().slice(0, 7);
      return getMonthSchedule(month);
    },
  },
  {
    name: 'get_missing_fixed_costs',
    toolset: 'finance',
    scope: 'finance',
    title: 'Échéances de charges fixes en retard',
    description:
      'Liste les échéances (loyer le 5, abonnement le 10…) dont la date est ' +
      'passée et qui ne sont pas entièrement réglées : sans dépense liée, ou ' +
      'réglée en partie seulement. Une échéance du jour ou à venir n’y figure pas.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => getLateFixedCostOccurrences(),
  },
];
