'use client';

// Demande de remboursement depuis la fiche d'une commande : lignes cochables
// (produits et suppléments) qui proposent le montant, montant libre ≤ restant,
// motif, canal et numéro préremplis (modifiables), remise en stock facultative.

import { useMemo, useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { canTransferVia } from '@/lib/refunds/destination';
import { RefundDestinationFields } from './refund-destination-fields';
import {
  buildRefundableLines,
  selectionToLines,
  selectionTotal,
  type LineSelection,
} from '@/lib/refunds/refundable-lines';
import { REFUND_REASONS, REFUND_REASON_LABELS } from '@/lib/schemas/refund';
import type { CartItem } from '@/lib/cart-store';
import type { PaymentMode } from '@/generated/prisma/client';
import { requestRefundAction } from '../actions';

const fmt = new Intl.NumberFormat('fr-FR');
const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export type RefundOrderInfo = {
  id: string;
  dailyNumber: number;
  items: CartItem[];
  /** Restant remboursable (encaissé − remboursements actifs). */
  remaining: number;
  cancelled: boolean;
  defaultChannel: PaymentMode;
  /** Payée via Jèko : le transfert est proposé par défaut. */
  paidViaJeko: boolean;
  customerPhone: string | null;
  /** Un avoir se rattache à un client : commande sans numéro = pas d'avoir. */
  hasCustomer: boolean;
};

export function RequestRefundSheet({
  order,
  canApprove,
  defaultOpen = false,
}: {
  order: RefundOrderInfo;
  canApprove: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = useMemo(() => buildRefundableLines(order.items), [order.items]);
  const [selection, setSelection] = useState<LineSelection>({});
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState<string>('PRODUCT_UNAVAILABLE');
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState<PaymentMode>(order.defaultChannel);
  const [delivery, setDelivery] = useState<'JEKO_TRANSFER' | 'MANUAL'>(
    order.paidViaJeko && canTransferVia(order.defaultChannel)
      ? 'JEKO_TRANSFER'
      : 'MANUAL'
  );
  const [phone, setPhone] = useState(order.customerPhone ?? '');
  const [asCredit, setAsCredit] = useState(false);
  const [restock, setRestock] = useState(false);
  const [cancelOrder, setCancelOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = Object.values(selection).some((q) => q > 0);
  const amount = Number(amountText) || 0;
  const isFull = amount === order.remaining && order.remaining > 0;
  const transferable = canTransferVia(channel);

  function toggle(key: string, max: number, on: boolean) {
    const next = { ...selection, [key]: on ? max : 0 };
    setSelection(next);
    const total = Math.min(selectionTotal(lines, next), order.remaining);
    setAmountText(total > 0 ? String(total) : '');
  }

  function setQuantity(key: string, max: number, value: number) {
    const q = Math.max(0, Math.min(max, value));
    const next = { ...selection, [key]: q };
    setSelection(next);
    const total = Math.min(selectionTotal(lines, next), order.remaining);
    setAmountText(total > 0 ? String(total) : '');
  }

  function submit(approveNow: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await requestRefundAction(
        {
          orderId: order.id,
          amount,
          reason,
          note: note.trim() || undefined,
          ...(asCredit
            ? { delivery: 'STORE_CREDIT' as const }
            : {
                channel,
                delivery: transferable ? delivery : 'MANUAL',
                destinationPhone: phone.trim() || undefined,
              }),
          restockItems: restock && chosen,
          lines: selectionToLines(lines, selection, amount),
        },
        { approveNow, cancelOrder: cancelOrder && isFull }
      );
      if (r.ok) {
        setOpen(false);
      } else {
        setError(r.error);
      }
    });
  }

  const invalid = amount <= 0 || amount > order.remaining;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" disabled={order.remaining <= 0}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Rembourser
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            Rembourser la commande #{String(order.dailyNumber).padStart(3, '0')}
          </SheetTitle>
          <SheetDescription>
            Reste remboursable : {fmt.format(order.remaining)} F. Les frais de
            paiement en ligne ne sont jamais remboursés.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Articles concernés (facultatif)
            </h3>
            <ul className="divide-y rounded-lg border">
              {lines.map((l) => {
                const q = selection[l.key] ?? 0;
                return (
                  <li
                    key={l.key}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <label className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={q > 0}
                        onChange={(e) =>
                          toggle(l.key, l.maxQuantity, e.target.checked)
                        }
                        className="h-4 w-4"
                      />
                      <span className="truncate">
                        {l.name}
                        {l.kind === 'SUPPLEMENT' && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (supplément)
                          </span>
                        )}
                      </span>
                    </label>
                    <span className="flex shrink-0 items-center gap-2">
                      {q > 0 && l.maxQuantity > 1 && (
                        <Input
                          type="number"
                          min={1}
                          max={l.maxQuantity}
                          value={q}
                          aria-label={`Quantité de ${l.name}`}
                          onChange={(e) =>
                            setQuantity(
                              l.key,
                              l.maxQuantity,
                              Number(e.target.value)
                            )
                          }
                          className="h-8 w-16"
                        />
                      )}
                      <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {fmt.format(l.unitAmount)} F
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rq-amount">Montant remboursé (F)</Label>
              <Input
                id="rq-amount"
                type="number"
                min={1}
                max={order.remaining}
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setAmountText(String(order.remaining))}
              >
                Tout rembourser ({fmt.format(order.remaining)} F)
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-reason">Motif</Label>
              <select
                id="rq-reason"
                className={selectClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REFUND_REASONS.filter((r) => r !== 'LATE_PAYMENT').map((r) => (
                  <option key={r} value={r}>
                    {REFUND_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rq-form">Forme du remboursement</Label>
            <select
              id="rq-form"
              className={selectClass}
              value={asCredit ? 'CREDIT' : 'MONEY'}
              onChange={(e) => setAsCredit(e.target.value === 'CREDIT')}
            >
              <option value="MONEY">Rendre l’argent</option>
              <option value="CREDIT" disabled={!order.hasCustomer}>
                Avoir (crédit sur la prochaine commande)
                {order.hasCustomer ? '' : ' — aucun client sur cette commande'}
              </option>
            </select>
            {asCredit && (
              <p className="text-xs text-muted-foreground">
                Aucun argent ne sort : le montant s’ajoute au solde d’avoir du
                client, utilisable en caisse et en ligne.
              </p>
            )}
          </div>

          {!asCredit && (
            <RefundDestinationFields
              channel={channel}
              onChannel={setChannel}
              delivery={delivery}
              onDelivery={setDelivery}
              phone={phone}
              onPhone={setPhone}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rq-note">Note (facultatif)</Label>
            <Textarea
              id="rq-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2 text-sm">
            <label
              className={`flex items-center gap-2 ${chosen ? '' : 'opacity-50'}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={restock && chosen}
                disabled={!chosen}
                onChange={(e) => setRestock(e.target.checked)}
              />
              Remettre les articles cochés en stock
            </label>
            {!order.cancelled && (
              <label
                className={`flex items-center gap-2 ${isFull ? '' : 'opacity-50'}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={cancelOrder && isFull}
                  disabled={!isFull}
                  onChange={(e) => setCancelOrder(e.target.checked)}
                />
                Annuler aussi la commande (remboursement total)
              </label>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || invalid} onClick={() => submit(false)}>
              Envoyer la demande
            </Button>
            {canApprove && (
              <Button
                variant="secondary"
                disabled={pending || invalid}
                onClick={() => submit(true)}
              >
                Demander et valider
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Un administrateur valide la demande avant que l’argent ne parte ou
            que l’avoir ne soit crédité.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
