// CSV « liste classée » des clients, pour les contacter à la main (invitation,
// appel…). Pur : la requête est dans `ranking-query.ts`. Format Excel FR (`;`,
// BOM). Le téléphone est écrit avec des espaces (« +225 07 88 12 34 56 ») : sans
// eux Excel le lit comme un nombre et l'affiche en notation scientifique.

import { toCsv } from '@/lib/csv';
import { formatPhoneForDisplay } from '@/lib/phone';
import { ABIDJAN_TZ } from '@/lib/timezone';

export type RankedRow = {
  name: string | null;
  phone: string;
  /** Total acheté, net des remboursements (FCFA). */
  total: number;
  orders: number;
  /** Jours différents avec commande. */
  days: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
};

export const RANKING_HEADERS = [
  'Rang',
  'Nom',
  'Téléphone',
  'Total acheté (FCFA)',
  'Commandes',
  'Jours avec commande',
  'Première commande',
  'Dernière commande',
];

const dayFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: ABIDJAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatDay = (d: Date | null) => (d ? dayFmt.format(d) : '');

/** Lignes déjà triées (meilleur en premier) : le rang est la position. */
export function buildRankingCsv(rows: RankedRow[]): string {
  return toCsv(
    RANKING_HEADERS,
    rows.map((r, i) => [
      i + 1,
      r.name?.trim() || '',
      formatPhoneForDisplay(r.phone),
      r.total,
      r.orders,
      r.days,
      formatDay(r.firstOrderAt),
      formatDay(r.lastOrderAt),
    ])
  );
}
