// lib/stock-history/order-audit.ts
//
// Contrôle « commande ↔ journal » (logique PURE, sans base). Une commande lancée
// doit avoir décompté exactement son besoin, ressource par ressource ; le journal
// le prouve ou le contredit. Les lectures (commandes, mouvements) vivent dans
// `order-audit-query.ts`.
//
// Consommation d'une commande = −Σ delta des motifs ci-dessous. `SHORTAGE_COVER`
// (production déclarée, compensée par une part plus grande d'`ORDER_KITCHEN`) et
// `REFUND_RESTOCK` (remise en stock après coup) sont exclus : les compter fausserait
// la somme sans dire si la vente a été décomptée.

import type { StockKind, StockReason } from './types';

export const CONSUMPTION_REASONS: StockReason[] = [
  'ORDER_KITCHEN',
  'HOLD_RESERVE',
  'HOLD_RELEASE',
  'ORDER_EDIT_ADD',
  'ORDER_EDIT_REMOVE',
  'EXPIRY_RELEASE',
];

export type ResourceNeed = {
  kind: StockKind;
  resourceId: string;
  label: string;
  needed: number;
};

export type ResourceLineStatus = 'ok' | 'missing' | 'excess';

export type ResourceLine = ResourceNeed & {
  /** Unités réellement décomptées d'après le journal (+ = sorties). */
  consumed: number;
  status: ResourceLineStatus;
};

export type OrderVerdict = 'ok' | 'missing' | 'excess' | 'unknown';

export type MovementSum = {
  kind: StockKind;
  resourceId: string;
  label: string;
  /** −Σ delta des motifs de consommation. */
  consumed: number;
};

export const resourceKey = (kind: StockKind, id: string) => `${kind}:${id}`;

/**
 * Compare le besoin d'une commande à la consommation journalisée. Une ressource
 * décomptée mais absente du besoin (option renommée depuis, retrait sans
 * restitution…) est signalée en excès plutôt que passée sous silence.
 * `unresolved` : options du besoin qu'on ne sait plus résoudre → on ne conclut pas
 * « ok » (verdict `unknown`), faute de pouvoir les comparer par id.
 */
export function compareOrderToJournal(input: {
  needs: ResourceNeed[];
  sums: MovementSum[];
  unresolved?: number;
}): { verdict: OrderVerdict; lines: ResourceLine[] } {
  const sumByKey = new Map(
    input.sums.map((s) => [resourceKey(s.kind, s.resourceId), s])
  );
  const lines: ResourceLine[] = [];
  const seen = new Set<string>();

  for (const need of input.needs) {
    const key = resourceKey(need.kind, need.resourceId);
    seen.add(key);
    const consumed = sumByKey.get(key)?.consumed ?? 0;
    lines.push({
      ...need,
      // Le libellé figé du journal (« Produit · Groupe · Option ») prime : il
      // reste juste si l'option est renommée ou si la ligne est partagée.
      label: sumByKey.get(key)?.label ?? need.label,
      consumed,
      status:
        consumed < need.needed
          ? 'missing'
          : consumed > need.needed
            ? 'excess'
            : 'ok',
    });
  }
  for (const sum of input.sums) {
    const key = resourceKey(sum.kind, sum.resourceId);
    if (seen.has(key) || sum.consumed === 0) continue;
    lines.push({
      kind: sum.kind,
      resourceId: sum.resourceId,
      label: sum.label,
      needed: 0,
      consumed: sum.consumed,
      status: sum.consumed > 0 ? 'excess' : 'missing',
    });
  }

  const verdict: OrderVerdict = lines.some((l) => l.status === 'missing')
    ? 'missing'
    : lines.some((l) => l.status === 'excess')
      ? 'excess'
      : (input.unresolved ?? 0) > 0
        ? 'unknown'
        : 'ok';
  return { verdict, lines };
}

export type ExplanationTone = 'ok' | 'info' | 'warn' | 'danger';

export type StockExplanation = {
  code:
    | 'before_journal'
    | 'counted'
    | 'unlimited'
    | 'missing'
    | 'excess'
    | 'unknown'
    | 'served_without_stock'
    | 'cancelled_before_launch'
    | 'cancelled_after_launch'
    | 'deferred'
    | 'held'
    | 'not_launched';
  tone: ExplanationTone;
  label: string;
};

const SERVED = new Set(['PREPARING', 'READY', 'COMPLETED']);

/**
 * Dit en français POURQUOI le stock a (ou n'a pas) bougé pour une commande : la
 * plupart des « le stock ne baisse pas » sont des cas normaux (non lancée,
 * différée, illimité), seuls `missing` et `served_without_stock` sont des défauts.
 */
export function explainOrderStock(input: {
  status: string;
  launched: boolean;
  deferred: boolean;
  held: boolean;
  /** Lancée avant le début du journal : rien à comparer. */
  beforeJournal: boolean;
  verdict: OrderVerdict;
  /** Toutes les ressources du besoin sont à stock illimité. */
  allUnlimited: boolean;
}): StockExplanation {
  if (input.beforeJournal) {
    return {
      code: 'before_journal',
      tone: 'info',
      label: 'Avant le journal : non vérifiable',
    };
  }
  if (input.launched) {
    switch (input.verdict) {
      case 'missing':
        return {
          code: 'missing',
          tone: 'danger',
          label: 'Lancée mais non (ou partiellement) décomptée',
        };
      case 'excess':
        return {
          code: 'excess',
          tone: 'warn',
          label: 'Décomptée en trop par rapport à la commande',
        };
      case 'unknown':
        return {
          code: 'unknown',
          tone: 'warn',
          label: 'Indéterminé : une option est introuvable (renommée ?)',
        };
      default:
        if (input.status === 'CANCELLED') {
          return {
            code: 'cancelled_after_launch',
            tone: 'info',
            label:
              'Décomptée au lancement, puis annulée : le stock n’est pas rendu (voulu)',
          };
        }
        return input.allUnlimited
          ? {
              code: 'unlimited',
              tone: 'info',
              label: 'Stock illimité : vente tracée, aucun stock à baisser',
            }
          : {
              code: 'counted',
              tone: 'ok',
              label: 'Décomptée au lancement',
            };
    }
  }
  if (SERVED.has(input.status)) {
    return {
      code: 'served_without_stock',
      tone: 'danger',
      label: 'Servie sans décompte de stock',
    };
  }
  if (input.status === 'CANCELLED') {
    return {
      code: 'cancelled_before_launch',
      tone: 'info',
      label: 'Annulée avant le lancement : rien à décompter',
    };
  }
  if (input.deferred) {
    return {
      code: 'deferred',
      tone: 'info',
      label: 'Commande différée : le stock du jour n’est pas touché',
    };
  }
  if (input.held) {
    return {
      code: 'held',
      tone: 'info',
      label:
        'Réservée pour la programmée du jour, le reste se décompte au lancement',
    };
  }
  return {
    code: 'not_launched',
    tone: 'info',
    label: 'Pas encore lancée : le stock se décompte à l’entrée en cuisine',
  };
}

/** Un défaut à traiter (par opposition à un cas normal ou non vérifiable). */
export function isStockDefect(code: StockExplanation['code']): boolean {
  return code === 'missing' || code === 'served_without_stock';
}
