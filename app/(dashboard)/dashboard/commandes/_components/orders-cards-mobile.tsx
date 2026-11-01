import type { listOrders } from '@/lib/orders';
import { PrintDeliveryNoteButton } from '@/components/(dashboard)/orders/print-delivery-note-button';
import { ReceiptActions } from '@/components/(dashboard)/orders/receipt-actions';
import Link from 'next/link';
import { getPickupCode } from '@/lib/orders/format';
import { formatAbidjanDateTime } from '@/lib/timezone';
import { Button } from '@/components/ui/button';
import { OrderCheckbox } from '../order-selection';
import { AdvanceStatusButton } from '../advance-status-button';
import { ExpressCompleteButton } from '../express-complete-button';
import { EncaisserButton } from '../../_components/encaisser-button';
import { PaymentBadge, StatusBadge } from './order-badges';
import { TYPE_ICONS, TYPE_LABELS, formatPickupTime } from './order-meta';

type OrderRow = Awaited<ReturnType<typeof listOrders>>['orders'][number];

export function OrdersCardsMobile({
  orders,
  canCash,
}: {
  orders: OrderRow[];
  canCash: boolean;
}) {
  return (
    <>
      {/* Téléphone : le tableau à 10 colonnes ne tient pas, et « Paiement » (masquée sous md) est le signal « à encaisser » du caissier. */}
      <div className="flex flex-col gap-3 md:hidden">
        {orders.map((order) => {
          const TypeIcon = TYPE_ICONS[order.orderType];
          const orderRef = `#${String(order.dailyNumber).padStart(3, '0')}`;
          return (
            <div
              key={order.id}
              className="flex flex-col gap-2 rounded-xl border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                {canCash && order.status !== 'CANCELLED' && (
                  <OrderCheckbox id={order.id} />
                )}
                <Link
                  href={`/dashboard/commandes/${order.id}`}
                  className="min-w-0 flex-1"
                >
                  <p className="flex flex-wrap items-center gap-1.5 font-mono text-sm font-semibold">
                    {orderRef}
                    <span
                      className="rounded bg-primary/10 px-1 text-xs text-primary"
                      title={`Code de retrait · ${order.reference}`}
                    >
                      {getPickupCode(order.reference)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-sans text-xs font-normal text-muted-foreground">
                      <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {TYPE_LABELS[order.orderType]}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm">
                    {order.customerName ?? 'Client non identifié'}
                    {order.customerPhone && (
                      <span className="text-muted-foreground">
                        {' · '}
                        {order.customerPhone}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Commandée le {formatAbidjanDateTime(order.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPickupTime(order.pickupTime)}
                  </p>
                </Link>
                <span className="shrink-0 text-right text-base font-bold tabular-nums">
                  {new Intl.NumberFormat('fr-FR').format(order.total)} F
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={order.status} />
                <PaymentBadge
                  isPaid={order.isPaid}
                  status={order.status}
                  paymentMode={order.paymentMode}
                  autoValidatedByAi={order.paymentAutoValidatedByAi}
                  paymentExpiresAt={order.paymentExpiresAt}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {canCash && (
                  <AdvanceStatusButton
                    orderId={order.id}
                    status={order.status}
                  />
                )}
                {canCash && !order.isPaid && order.status !== 'CANCELLED' && (
                  <EncaisserButton
                    orderId={order.id}
                    orderRef={orderRef}
                    amount={order.total - (order.depositPaid ?? 0)}
                    variant="outline"
                    size="sm"
                  />
                )}
                {canCash &&
                  order.status !== 'CANCELLED' &&
                  order.status !== 'COMPLETED' && (
                    <ExpressCompleteButton
                      orderId={order.id}
                      orderRef={orderRef}
                      amount={order.total - (order.depositPaid ?? 0)}
                      isPaid={order.isPaid}
                      pickupTime={order.pickupTime}
                      stockReserved={order.stockReservedAt !== null}
                      variant="outline"
                      size="sm"
                    />
                  )}
                <PrintDeliveryNoteButton orderId={order.id} iconOnly />
                <ReceiptActions
                  orderId={order.id}
                  code={getPickupCode(order.reference)}
                  customerPhone={order.customerPhone}
                  iconOnly
                />
                <Button variant="ghost" size="sm" asChild className="ml-auto">
                  <Link href={`/dashboard/commandes/${order.id}`}>Voir</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
