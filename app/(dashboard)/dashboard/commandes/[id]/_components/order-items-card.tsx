import type { OrderStatus } from '@/generated/prisma/client';
import { PrintDeliveryNoteButton } from '@/components/(dashboard)/orders/print-delivery-note-button';
import { ReceiptActions } from '@/components/(dashboard)/orders/receipt-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { MenuCategory } from '@/config/menu';
import type { ContactSettings } from '@/lib/contact-settings';
import type { CartItem } from '@/lib/cart-store';
import { getItemGross, getItemNet } from '@/lib/orders/totals';
import { formatSupplementLabel, getPickupCode } from '@/lib/orders/format';
import { splitSupplementsByKind } from '@/lib/supplements/kind';
import { CopyRecapButton } from '../../../_components/copy-recap-button';
import { EditOrderItems } from '../edit-order-items';
import type { OrderDetail } from './helpers';
import { OrderTotals } from './order-totals';

export function OrderItemsCard({
  order,
  items,
  menu,
  contactSettings,
  trackingUrl,
  canCash,
  canSeeMargins,
}: {
  order: OrderDetail;
  items: CartItem[];
  menu: MenuCategory[];
  contactSettings: ContactSettings;
  trackingUrl: string | undefined;
  canCash: boolean;
  canSeeMargins: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Articles</span>
          <div className="flex flex-wrap items-center gap-2">
            <CopyRecapButton
              customerName={order.customerName}
              dailyNumber={order.dailyNumber}
              reference={order.reference}
              amount={order.total}
              items={items}
              loyaltyDiscount={order.loyaltyDiscount}
              contactSettings={contactSettings}
              trackingUrl={trackingUrl}
              size="sm"
              className="w-auto"
            />
            <PrintDeliveryNoteButton orderId={order.id} />
            <ReceiptActions
              orderId={order.id}
              code={getPickupCode(order.reference)}
              customerPhone={order.customerPhone}
            />
            {canCash && (
              <EditOrderItems
                orderId={order.id}
                initialItems={items}
                menu={menu}
                status={order.status as OrderStatus}
                stockReserved={order.stockReservedAt !== null}
              />
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {items.map((item) => {
            const gross = getItemGross(item);
            const net = getItemNet(item);
            const discounted = gross !== net;
            const unitCost =
              (item.coutMatiere ?? 0) + (item.coutEmballage ?? 0);
            const lineCost = unitCost * item.quantity;
            const hasCost = unitCost > 0;
            const margin = net - lineCost;
            return (
              <li key={item.cartId}>
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span>
                      {item.productName} x{item.quantity}
                    </span>
                    {item.addedLater && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Ajout
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    {discounted && (
                      <span className="mr-1 text-sm text-muted-foreground line-through">
                        {new Intl.NumberFormat('fr-FR').format(gross)}
                      </span>
                    )}
                    {new Intl.NumberFormat('fr-FR').format(net)} FCFA
                  </span>
                </div>
                {item.supplements.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-4 text-sm text-muted-foreground">
                    {[
                      ...splitSupplementsByKind(item.supplements).flavors,
                      ...splitSupplementsByKind(item.supplements).extras,
                    ].map((sup, i) => (
                      <li key={i}>
                        {sup.kind === 'flavor' && (
                          <span className="mr-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Goût
                          </span>
                        )}
                        {sup.groupName} : {formatSupplementLabel(sup)}
                        {sup.price > 0
                          ? ` (+${sup.price * (sup.quantity ?? 1)} FCFA)`
                          : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {discounted && (
                  <p className="mt-0.5 text-sm font-medium text-green-700 dark:text-green-400">
                    Remise : -
                    {new Intl.NumberFormat('fr-FR').format(gross - net)} FCFA
                    {item.discountReason ? ` — ${item.discountReason}` : ''}
                  </p>
                )}
                {canSeeMargins && hasCost && (
                  <p className="mt-0.5 pl-0 text-xs text-muted-foreground">
                    Coût : {new Intl.NumberFormat('fr-FR').format(lineCost)}{' '}
                    FCFA
                    {' · '}Marge :{' '}
                    {new Intl.NumberFormat('fr-FR').format(margin)} FCFA
                    {net > 0 ? ` (${Math.round((margin / net) * 100)}%)` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <Separator className="my-4" />
        <OrderTotals
          items={items}
          order={order}
          canSeeMargins={canSeeMargins}
        />
      </CardContent>
    </Card>
  );
}
