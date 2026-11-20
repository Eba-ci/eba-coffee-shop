// lib/mcp/tools/fixed-cost-links.ts
//
// Outils MCP — historique des charges fixes et rapprochement dépense ↔ échéance
// (#455). Aucune règle dupliquée : mêmes fonctions que l'interface
// (`getFixedCostHistory`, `proposeOccurrenceLinks` via `getLinkProposals`,
// `linkExpenses` / `unlinkExpenses`). Écritures en SIMULATION par défaut
// (`confirmer: true` exécute). Les dépenses de salaire sont refusées par la
// règle de liaison et jamais lues : aucun détail de paie ici.

import { z } from 'zod';
import { getFixedCostHistory } from '@/lib/fixed-costs/history-queries';
import {
  getLinkProposals,
  listUnlinkedFixedExpenses,
} from '@/lib/fixed-costs/links-queries';
import {
  linkExpenses,
  linkTargetSchema,
  unlinkExpenses,
  type LinkActor,
} from '@/lib/fixed-costs/links-mutations';
import { todayDateString } from '@/lib/timezone';
import { mcpActor } from '../actor-context';
import { idSchema, rangeSchema } from './helpers';
import type { McpTool } from './types';

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format YYYY-MM');

const confirmer = z.object({
  confirmer: z
    .boolean()
    .optional()
    .describe('false/absent = simulation (rien n’est écrit) ; true = exécute.'),
});

const DRY_RUN_MESSAGE =
  'Simulation : rien n’a été modifié. Rappelez l’outil avec confirmer: true pour exécuter.';

/** Acteur de l'écriture : l'utilisateur OAuth identifié, null pour la clé statique. */
function actor(): LinkActor {
  return { userId: mcpActor()?.userId ?? null, source: 'MCP' };
}

export const fixedCostLinksTools: McpTool[] = [
  {
    name: 'detect_fixed_cost_history',
    toolset: 'finance',
    scope: 'finance',
    title: 'Détecter l’historique des charges fixes',
    description:
      'Analyse les dépenses des catégories de nature FIXED (hors Salaires) : ' +
      'mois couverts avec leur total réel, trous internes, mois sans dépense ' +
      'depuis la dernière, prise d’effet proposée (mois de la première dépense), ' +
      'confiance (probable / à vérifier / unique) et si la catégorie est déjà ' +
      'convertie en charge. Mêmes chiffres que l’écran « Historique détecté ». ' +
      'Lecture seule. `referenceMonth` (YYYY-MM, défaut = mois en cours) borne ' +
      '« puis plus rien ».',
    inputSchema: z.object({ referenceMonth: monthSchema.optional() }),
    readOnly: true,
    handler: (args) =>
      getFixedCostHistory(
        (args as { referenceMonth?: string }).referenceMonth ??
          todayDateString().slice(0, 7)
      ),
  },
  {
    name: 'list_unlinked_fixed_expenses',
    toolset: 'finance',
    scope: 'finance',
    title: 'Dépenses non liées d’une catégorie fixe',
    description:
      'Dépenses d’UNE catégorie, sur une plage, qui ne règlent aucune échéance ' +
      '(ni liées, ni ligne de salaire). `categoryId` obligatoire. Lecture seule.',
    inputSchema: rangeSchema.extend({ categoryId: idSchema }),
    readOnly: true,
    handler: (args) => {
      const { from, to, categoryId } = args as {
        from: string;
        to: string;
        categoryId: string;
      };
      return listUnlinkedFixedExpenses({
        from: from <= to ? from : to,
        to: from <= to ? to : from,
        categoryIds: [categoryId],
      });
    },
  },
  {
    name: 'propose_fixed_cost_links',
    toolset: 'finance',
    scope: 'finance',
    title: 'Proposer des rapprochements dépense / échéance',
    description:
      'Propose, sans rien écrire, des correspondances entre dépenses non liées ' +
      'et échéances de charges fixes : même catégorie, dépense tombée dans la ' +
      'période de l’échéance, montant identique ou proche. Chaque proposition ' +
      'porte `score` (0..1), `delta` (dépense − échéance, FCFA) et ' +
      '`occurrenceDueDate` ; à confirmer avec link_expense_to_occurrence. ' +
      '`categoryId` optionnel restreint aux charges de cette catégorie.',
    inputSchema: rangeSchema.extend({ categoryId: idSchema.optional() }),
    readOnly: true,
    handler: (args) => {
      const { from, to, categoryId } = args as {
        from: string;
        to: string;
        categoryId?: string;
      };
      return getLinkProposals({
        from: from <= to ? from : to,
        to: from <= to ? to : from,
        categoryId,
      });
    },
  },
  {
    name: 'link_expense_to_occurrence',
    toolset: 'finance',
    scope: 'finance',
    title: 'Lier une dépense à une échéance',
    description:
      'Lie UNE dépense à l’échéance `dueDate` d’une charge fixe (`costId`). ' +
      'Refusé si la dépense est dans une autre catégorie que la charge, déjà ' +
      'liée à une autre échéance, de salaire, ou si `dueDate` n’est pas une vraie ' +
      'échéance. SIMULATION par défaut : renvoie le statut résultant ' +
      '(PAID/PARTIAL…) sans rien écrire ; `confirmer: true` exécute et trace ' +
      'l’action. Rejouable.',
    inputSchema: linkTargetSchema.and(confirmer),
    readOnly: false,
    handler: async (args) => {
      const { confirmer: go, ...target } = args as z.infer<
        typeof linkTargetSchema
      > & { confirmer?: boolean };
      const outcomes = await linkExpenses([target], actor(), {
        dryRun: !go,
      });
      return go
        ? { dryRun: false, outcomes }
        : { dryRun: true, message: DRY_RUN_MESSAGE, outcomes };
    },
  },
  {
    name: 'unlink_expense',
    toolset: 'finance',
    scope: 'finance',
    title: 'Délier une dépense d’une échéance',
    description:
      'Défait la liaison d’une dépense avec son échéance : elle redevient non ' +
      'liée et l’échéance repasse à son statut calculé. SIMULATION par défaut ; ' +
      '`confirmer: true` exécute. Rejouable (une dépense déjà libre est ignorée).',
    inputSchema: z.object({ expenseId: idSchema }).and(confirmer),
    readOnly: false,
    handler: async (args) => {
      const { expenseId, confirmer: go } = args as {
        expenseId: string;
        confirmer?: boolean;
      };
      const outcomes = await unlinkExpenses([expenseId], actor(), {
        dryRun: !go,
      });
      return go
        ? { dryRun: false, outcomes }
        : { dryRun: true, message: DRY_RUN_MESSAGE, outcomes };
    },
  },
];
