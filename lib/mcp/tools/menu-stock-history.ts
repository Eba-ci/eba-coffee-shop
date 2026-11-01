// lib/mcp/tools/menu-stock-history.ts
//
// Outils MCP — menu — historique du stock (lecture seule). Aucune logique
// métier ici : `lib/stock-history/{queries,audit}.ts`.

import { z } from 'zod';
import { runStockAudit } from '@/lib/stock-history/audit';
import {
  getStockMovementSummary,
  listStockMovements,
  type StockMovementFilters,
} from '@/lib/stock-history/queries';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { dateOnly, idSchema } from './helpers';
import type { McpTool } from './types';

const REASONS = [
  'ORDER_KITCHEN',
  'HOLD_RESERVE',
  'HOLD_RELEASE',
  'ORDER_EDIT_ADD',
  'ORDER_EDIT_REMOVE',
  'SHORTAGE_COVER',
  'REFUND_RESTOCK',
  'EXPIRY_RELEASE',
  'MANUAL_RESTOCK',
  'MANUAL_SET',
  'BULK_SET',
  'FORM_EDIT',
  'CREATED',
  'OPTION_REMOVED',
  'BASELINE',
  'ANOMALY',
] as const;

const DAY_MS = 86_400_000;

const filterShape = {
  from: dateOnly.optional().describe('Début (inclus), YYYY-MM-DD.'),
  to: dateOnly.optional().describe('Fin (incluse), YYYY-MM-DD.'),
  resourceId: idSchema
    .optional()
    .describe('Id d’un produit ou d’une option (get_menu / search_products).'),
  search: z
    .string()
    .min(1)
    .optional()
    .describe('Nom d’un produit ou d’un goût (recherche floue).'),
  reasons: z.array(z.enum(REASONS)).optional().describe('Motifs retenus.'),
  source: z.enum(['STAFF', 'MCP', 'SYSTEM']).optional(),
  orderId: idSchema.optional().describe('Mouvements d’une commande.'),
};

const listSchema = z.object({
  ...filterShape,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

const summarySchema = z.object(filterShape);

function toFilters(
  a: z.infer<typeof summarySchema>
): Omit<StockMovementFilters, 'page' | 'pageSize'> {
  const from = parseDateOnlyToUTC(a.from ?? a.to);
  const to = parseDateOnlyToUTC(a.to ?? a.from);
  return {
    from,
    // Fin incluse → borne exclusive au lendemain.
    toExclusive: to ? new Date(to.getTime() + DAY_MS) : undefined,
    resourceId: a.resourceId,
    search: a.search,
    reasons: a.reasons,
    source: a.source,
    orderId: a.orderId,
  };
}

export const menuStockHistoryTools: McpTool[] = [
  {
    name: 'list_stock_movements',
    toolset: 'menu',
    title: 'Historique du stock (mouvements)',
    description:
      'Liste, du plus récent au plus ancien, les mouvements de stock des ' +
      'produits ET des goûts/options : `delta` (− sortie, + entrée), `before` → ' +
      '`after`, `reason` (ORDER_KITCHEN = vente au lancement en cuisine, ' +
      'HOLD_RESERVE/HOLD_RELEASE = réservation pour une programmée, ' +
      'MANUAL_RESTOCK/MANUAL_SET/BULK_SET/FORM_EDIT = geste du personnel, ' +
      'REFUND_RESTOCK, EXPIRY_RELEASE, SHORTAGE_COVER = production déclarée, ' +
      'OPTION_REMOVED = option supprimée ou renommée, ANOMALY = stock non rendu), ' +
      '`source` (STAFF/MCP/SYSTEM), la commande liée et la personne. Un stock ' +
      'illimité a `before`/`after` à null mais garde `delta`. Filtre par ' +
      'produit/goût (`resourceId` ou `search`), motif, commande ou dates ; ' +
      'pagine plutôt que de tout lire. Le journal démarre à son déploiement ' +
      '(ligne BASELINE = relevé de départ).',
    inputSchema: listSchema,
    readOnly: true,
    handler: async (args) => {
      const a = listSchema.parse(args);
      const res = await listStockMovements({
        ...toFilters(a),
        page: a.page,
        pageSize: a.pageSize,
      });
      return {
        ...res,
        movements: res.movements.map((m) => ({
          id: m.id,
          at: m.createdAt.toISOString(),
          kind: m.kind,
          resourceId: m.resourceId,
          label: m.label,
          reason: m.reason,
          source: m.source,
          delta: m.delta,
          before: m.before,
          after: m.after,
          orderId: m.orderId,
          orderNumber: m.orderNumber,
          refundId: m.refundId,
          actor: m.actorName,
          note: m.note,
        })),
      };
    },
  },
  {
    name: 'get_stock_history_summary',
    toolset: 'menu',
    title: 'Comment le stock diminue (résumé par motif)',
    description:
      'Résume les mouvements de stock par motif sur la sélection : nombre de ' +
      'mouvements, unités sorties (`unitsOut`) et entrées (`unitsIn`). Mêmes ' +
      'filtres que `list_stock_movements` ; passe `resourceId` ou `search` pour ' +
      'répondre à « où est passé le stock de ce produit ? ».',
    inputSchema: summarySchema,
    readOnly: true,
    handler: (args) =>
      getStockMovementSummary(toFilters(summarySchema.parse(args))),
  },
  {
    name: 'get_stock_audit',
    toolset: 'menu',
    title: 'Angles morts du stock',
    description:
      'Contrôle de cohérence du stock : écarts entre le stock actuel et le ' +
      'dernier mouvement journalisé (une écriture est passée sans trace), ' +
      'stocks suivis sans relevé de départ, stocks négatifs, réservations ' +
      'orphelines (produit ou goût supprimé) et nombre d’anomalies récentes. ' +
      'Lecture seule : le relevé de départ se pose depuis l’application.',
    inputSchema: z.object({}),
    readOnly: true,
    handler: () => runStockAudit(),
  },
];
