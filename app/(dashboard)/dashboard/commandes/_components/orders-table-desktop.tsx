import type { listOrders } from '@/lib/orders';
import { PrintDeliveryNoteButton } from '@/components/(dashboard)/orders/print-delivery-note-button';
import { ReceiptActions } from '@/components/(dashboard)/orders/receipt-actions';
import Link from 'next/link';
import { getPickupCode } from '@/lib/orders/format';
import { formatAbidjanDateTime } from '@/lib/timezone';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderCheckbox } from '../order-selection';
import { AdvanceStatusButton } from '../advance-status-button';
import { ExpressCompleteButton } from '../express-complete-button';
import { EncaisserButton } from '../../_components/encaisser-button';
import { PaymentBadge, StatusBadge } from './order-badges';
import {
  SOURCE_META,
  TYPE_ICONS,
  TYPE_LABELS,
  formatPickupTime,
} from './order-meta';

type OrderRow = Awaited<ReturnType<typeof listOrders>>['orders'][number];

export function OrdersTableDesktop({
  orders,
  canCash,
}: {
  orders: OrderRow[];
  canCash: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow>
            {canCash && <TableHead className="w-9" />}
            <TableHead>#</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Téléphone</TableHead>
            <TableHead>Commandée le</TableHead>
            <TableHead>Créneau</TableHead>
            <TableHead className="hidden md:table-cell">Articles</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="hidden md:table-cell">Paiement</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const TypeIcon = TYPE_ICONS[order.orderType];
            return (
              <TableRow key={order.id}>
                {canCash && (
                  <TableCell>
                    {order.status !== 'CANCELLED' && (
                      <OrderCheckbox id={order.id} />
                    )}
                  </TableCell>
                )}
                <TableCell className="font-mono text-sm">
                  #{String(order.dailyNumber).padStart(3, '0')}
                  <span
                    className="ml-1.5 rounded bg-primary/10 px-1 text-xs text-primary"
                    title={`Code de retrait · ${order.reference}`}
                  >
                    {getPickupCode(order.reference)}
                  </span>
                  {SOURCE_META[order.source] && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      title={SOURCE_META[order.source]!.title}
                    >
                      {(() => {
                        const { Icon, label } = SOURCE_META[order.source]!;
                        return (
                          <>
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {label}
                          </>
                        );
                      })()}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center gap-1 text-xs"
                    title={TYPE_LABELS[order.orderType]}
                  >
                    <TypeIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {TYPE_LABELS[order.orderType]}
                    </span>
                  </span>
                </TableCell>
                <TableCell>{order.customerName ?? '—'}</TableCell>
                <TableCell>{order.customerPhone ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAbidjanDateTime(order.createdAt)}
                </TableCell>
                <TableCell>{formatPickupTime(order.pickupTime)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {(order.items as unknown[]).length}
                </TableCell>
                <TableCell className="tabular-nums">
                  {new Intl.NumberFormat('fr-FR').format(order.total)} F
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <PaymentBadge
                    isPaid={order.isPaid}
                    status={order.status}
                    paymentMode={order.paymentMode}
                    autoValidatedByAi={order.paymentAutoValidatedByAi}
                    paymentExpiresAt={order.paymentExpiresAt}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {/* ANALYSTE voit le lien « Commandes » mais est hors CASHIER_ROLES : ces boutons n'aboutiraient qu'à un refus serveur. */}
                    {canCash && (
                      <AdvanceStatusButton
                        orderId={order.id}
                        status={order.status}
                      />
                    )}
                    {canCash &&
                      !order.isPaid &&
                      order.status !== 'CANCELLED' && (
                        <EncaisserButton
                          orderId={order.id}
                          orderRef={`#${String(order.dailyNumber).padStart(3, '0')}`}
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
                          orderRef={`#${String(order.dailyNumber).padStart(3, '0')}`}
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
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/commandes/${order.id}`}>
                        Voir
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
