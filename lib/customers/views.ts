// Vues rapides de la liste des clients (« Meilleurs », « Plus fidèles »,
// « Réguliers ») et période qui les borne. Pur : partagé par la page (URL), le
// serveur (requête) et le tableau (tri affiché).

import type { CustomerSortKey } from './types';

export const CUSTOMER_VIEWS = ['meilleurs', 'fideles', 'reguliers'] as const;
export type CustomerView = (typeof CUSTOMER_VIEWS)[number];

export const CUSTOMER_VIEW_LABELS: Record<CustomerView, string> = {
  meilleurs: 'Meilleurs',
  fideles: 'Plus fidèles',
  reguliers: 'Réguliers',
};

/** `null` dans l'URL = tout l'historique. */
export const CUSTOMER_PERIODS = ['30j', '90j', '12m'] as const;
export type CustomerPeriod = (typeof CUSTOMER_PERIODS)[number];

export const CUSTOMER_PERIOD_LABELS: Record<CustomerPeriod, string> = {
  '30j': '30 jours',
  '90j': '90 jours',
  '12m': '12 mois',
};

const PERIOD_DAYS: Record<CustomerPeriod, number> = {
  '30j': 30,
  '90j': 90,
  '12m': 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Début de la fenêtre ; `undefined` = pas de borne (tout l'historique). */
export function periodStart(
  period: CustomerPeriod | null | undefined,
  now: Date = new Date()
): Date | undefined {
  return period
    ? new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS)
    : undefined;
}

/** Tri appliqué par une vue quand l'utilisateur n'en a pas choisi un autre. */
export function viewDefaultSort(
  view: CustomerView | null | undefined
): CustomerSortKey | undefined {
  if (view === 'meilleurs') return 'totalSpent';
  if (view === 'fideles' || view === 'reguliers') return 'ordersCount';
  return undefined;
}
