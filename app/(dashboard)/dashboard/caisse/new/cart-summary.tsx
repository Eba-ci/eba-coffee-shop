'use client';

import { Copy, Gift, Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { priceFormatter } from '@/config/menu';
import { getItemTotal, type CartItem } from '@/lib/cart-store';
import {
  getItemGross,
  getItemNet,
  getMaxItemDiscount,
} from '@/lib/orders/totals';
import { formatSupplementsSummary } from '@/lib/orders/format';
import { LineDiscountControl } from '../../_components/line-discount-control';
import type { LoyaltyCard } from '@/lib/hooks/use-new-order';
import { computeRequiredDeposit } from '@/lib/deposits';
import { upcomingRewardDiscount } from '@/lib/loyalty-compute';

type Props = {
  items: CartItem[];
  onQuantityChange: (cartId: string, quantity: number) => void;
  onRemove: (cartId: string) => void;
  onDiscountChange: (
    cartId: string,
    discount: number,
    reason: string | null
  ) => void;
  /** Ouvre le sélecteur pour ajouter un exemplaire de plus de cette ligne,
   * avec des suppléments possiblement différents (ex. 2 crêpes dont une
   * seule avec chantilly) — le simple stepper +/- applique toujours les
   * mêmes suppléments à toute la ligne. */
  onDuplicate: (item: CartItem) => void;
  /** Produits ayant des groupes de suppléments configurés : n'affiche
   * « Dupliquer » que pour ceux-là. */
  productsWithOptions: Set<string>;
  loyaltyCard: LoyaltyCard | null;
  loyaltyRewardId: string | null;
  onLoyaltyRewardChange: (rewardId: string | null) => void;
};

export function CartSummary({
  items,
  onQuantityChange,
  onRemove,
  onDiscountChange,
  onDuplicate,
  productsWithOptions,
  loyaltyCard,
  loyaltyRewardId,
  onLoyaltyRewardChange,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Aucun article dans la commande.
      </div>
    );
  }

  const total = items.reduce((s, i) => s + getItemTotal(i), 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  const availableRewards = loyaltyCard?.availableRewards ?? [];
  const selectedReward =
    availableRewards.find((r) => r.id === loyaltyRewardId) ?? null;
  const loyaltyDiscount = selectedReward
    ? Math.min(selectedReward.capAmount, total)
    : 0;
  const upcomingDiscount = selectedReward
    ? 0
    : upcomingRewardDiscount(loyaltyCard, total);
  const totalDue = total - loyaltyDiscount - upcomingDiscount;
  const depositAmount = computeRequiredDeposit(items, totalDue);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Panier
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {count} article{count > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const gross = getItemGross(item);
          const net = getItemNet(item);
          const discounted = gross !== net;
          return (
            <li key={item.cartId} className="px-3 py-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                    {item.productName}
                    {/* Informatif seulement : contrairement au checkout en
                        ligne, la caisse n'est PAS bloquée par cette règle
                        (voir lib/orders/availability.ts) — le personnel
                        garde la main sur les exceptions. */}
                    {(item.advanceOrderDays ?? 0) > 0 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        Commande à J-{item.advanceOrderDays}
                      </span>
                    )}
                    {item.requiresDeposit && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">
                        Acompte requis
                      </span>
                    )}
                  </p>
                  {item.supplements.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                      {formatSupplementsSummary(item.supplements, ' · ')}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <LineDiscountControl
                      maxDiscount={getMaxItemDiscount(item)}
                      discount={item.discount ?? 0}
                      reason={item.discountReason ?? null}
                      onChange={(d, r) => onDiscountChange(item.cartId, d, r)}
                    />
                    {productsWithOptions.has(item.productId) && (
                      <button
                        type="button"
                        onClick={() => onDuplicate(item)}
                        title="Ajouter un exemplaire avec des suppléments différents"
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <Copy className="size-3.5" /> Dupliquer
                      </button>
                    )}
                  </div>
                  {item.discountReason && (
                    <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                      Motif : {item.discountReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:items-start">
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(q) => onQuantityChange(item.cartId, q)}
                  />
                  <span className="ml-auto w-16 shrink-0 text-right text-sm tabular-nums sm:ml-0">
                    {discounted && (
                      <span className="block text-xs text-muted-foreground line-through">
                        {priceFormatter.format(gross)}
                      </span>
                    )}
                    <span
                      className={cn(
                        'font-semibold',
                        discounted && 'text-green-700 dark:text-green-400'
                      )}
                    >
                      {priceFormatter.format(net)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.cartId)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Supprimer ${item.productName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {loyaltyCard?.frozen === 'customer' && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Fidélité désactivée pour ce client : aucun tampon ni récompense.
        </p>
      )}

      {availableRewards.length > 0 && (
        <div className="border-t bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100">
            <Gift className="h-3.5 w-3.5" />
            Récompense fidélité disponible
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableRewards.map((r) => {
              const active = r.id === loyaltyRewardId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onLoyaltyRewardChange(active ? null : r.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-100'
                  )}
                >
                  {active ? '✓ ' : ''}-{priceFormatter.format(r.capAmount)} F
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loyaltyDiscount > 0 && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <span>Récompense fidélité</span>
          <span className="tabular-nums">
            -{priceFormatter.format(loyaltyDiscount)} F
          </span>
        </div>
      )}

      {upcomingDiscount > 0 && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <span>Réduction fidélité débloquée par cette commande</span>
          <span className="tabular-nums">
            -{priceFormatter.format(upcomingDiscount)} F
          </span>
        </div>
      )}

      <div className="flex items-center justify-between border-t px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total
        </span>
        <span className="text-base font-bold tabular-nums">
          {priceFormatter.format(totalDue)} F
        </span>
      </div>

      {depositAmount != null && (
        <div className="flex items-center justify-between border-t bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Acompte minimum requis</span>
          <span className="font-semibold tabular-nums">
            {priceFormatter.format(depositAmount)} F
          </span>
        </div>
      )}
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-md border bg-background">
      {/* Le « − » s'arrête à 1 : descendre à 0 supprimait la ligne en silence,
          sans confirmation ni annulation. La suppression passe par la corbeille,
          qui est explicite. */}
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="flex h-11 w-11 items-center justify-center rounded-l-md transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Diminuer la quantité"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-8 text-center text-sm font-medium tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-r-md transition-colors hover:bg-muted"
        aria-label="Augmenter la quantité"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
