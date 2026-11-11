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
  getMissingFixedCostPeriods,
  listFixedCosts,
} from '@/lib/fixed-costs/queries';
import {
  fixedCostInputSchema,
  fixedCostObjectSchema,
} from '@/lib/schemas/fixed-cost';
import { idSchema, rangeSchema } from './helpers';
import type { McpTool } from './types';

export const fixedCostsTools: McpTool[] = [
  {
    name: 'list_fixed_costs',
    toolset: 'finance',
    scope: 'finance',
    title: 'Lister les charges fixes',
    description:
      'Renvoie les charges fixes suivies pour le point mort (loyer, salaires…) : ' +
      'montant par période, périodicité (DAILY/WEEKLY/MONTHLY/QUARTERLY/YEARLY), ' +
      'prise d’effet, fin éventuelle, catégorie de dépense attendue.',
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
      'dépense attendue (pour l’alerte des périodes non saisies).',
    inputSchema: fixedCostObjectSchema,
    readOnly: false,
    handler: (args) => createFixedCost(fixedCostInputSchema.parse(args)),
  },
  {
    name: 'update_fixed_cost',
    toolset: 'finance',
    scope: 'finance',
    title: 'Modifier une charge fixe',
    description:
      'Mise à jour PARTIELLE d’une charge fixe : ne fournis que les champs à modifier.',
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
      '`margin.rate` null = marge non calculable (coûts de revient manquants).',
    inputSchema: rangeSchema,
    readOnly: true,
    handler: (args) => {
      const { from, to } = args as { from: string; to: string };
      return getBreakEvenReport(from <= to ? from : to, from <= to ? to : from);
    },
  },
  {
    name: 'get_missing_fixed_costs',
    toolset: 'finance',
    scope: 'finance',
    title: 'Charges fixes non saisies',
    description:
      'Liste les périodes échues (mois, trimestre…) d’une charge fixe active où ' +
      'AUCUNE dépense de sa catégorie n’a été saisie. La période en cours n’y figure pas.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => getMissingFixedCostPeriods(),
  },
];
