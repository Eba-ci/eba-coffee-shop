// lib/stock-history/types.ts
//
// Types du journal de stock (cf. `StockMovement`, prisma/schema.prisma).

import type {
  StockHoldKind,
  StockMovementReason,
  StockMovementSource,
} from '@/generated/prisma/client';

export type StockKind = StockHoldKind;
export type StockReason = StockMovementReason;
export type StockSource = StockMovementSource;

/** Contexte d'un mouvement : qui, d'où, pour quelle commande. */
export type StockLogCtx = {
  orderId?: string | null;
  refundId?: string | null;
  actorId?: string | null;
  /** Défaut `STAFF`. `MCP` pour les outils d'administration, `SYSTEM` pour les passages automatiques. */
  source?: StockSource;
  note?: string | null;
};

export const STAFF_CTX: StockLogCtx = { source: 'STAFF' };
export const SYSTEM_CTX: StockLogCtx = { source: 'SYSTEM' };
export const MCP_CTX: StockLogCtx = { source: 'MCP' };

/** Libellés français des motifs (page d'historique, outils MCP). */
export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  BASELINE: 'Stock initial (relevé de départ)',
  ORDER_KITCHEN: 'Vente (lancement en cuisine)',
  HOLD_RESERVE: 'Réservé pour une commande programmée',
  HOLD_RELEASE: 'Réservation rendue au stock',
  ORDER_EDIT_ADD: 'Commande modifiée (ajout)',
  ORDER_EDIT_REMOVE: 'Commande modifiée (retrait)',
  SHORTAGE_COVER: 'Production déclarée (pénurie couverte)',
  REFUND_RESTOCK: 'Remise en stock (remboursement)',
  EXPIRY_RELEASE: 'Commande en ligne expirée',
  MANUAL_RESTOCK: 'Réapprovisionnement',
  MANUAL_SET: 'Stock fixé à la main',
  BULK_SET: 'Stock fixé en lot',
  FORM_EDIT: 'Modifié depuis la fiche',
  CREATED: 'Création',
  OPTION_REMOVED: 'Option supprimée ou renommée (stock perdu)',
  ANOMALY: 'Anomalie',
};
