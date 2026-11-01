// Définition UNIQUE des paramètres d'URL de l'historique du stock (nuqs).
// Partagée par le serveur (`createLoader`, cf. parse-search-params.ts) et par
// le client (`useQueryStates`, cf. use-stock-history-nav.ts).
//
// Import depuis `nuqs/server` : aucun code React, utilisable côté serveur.

import { parseAsString, parseAsStringLiteral } from 'nuqs/server';
import { dateRangeParsers, pageParser } from '@/lib/url-state/shared-params';

export const STOCK_REASONS = [
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

export const STOCK_SOURCES = ['STAFF', 'MCP', 'SYSTEM'] as const;

export const stockHistoryParsers = {
  page: pageParser,
  reason: parseAsStringLiteral(STOCK_REASONS),
  source: parseAsStringLiteral(STOCK_SOURCES),
  search: parseAsString,
  /** Une seule ressource (produit ou option), posée en cliquant sur son nom. */
  resource: parseAsString,
  /** Une seule commande (lien depuis la fiche commande). */
  order: parseAsString,
  // Plage de dates (from / to / range) : partagée avec `DateRangeFilter`.
  ...dateRangeParsers,
};
