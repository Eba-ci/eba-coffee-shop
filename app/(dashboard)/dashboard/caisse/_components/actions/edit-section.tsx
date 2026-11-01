'use client';

import {
  Pencil,
  CalendarClock,
  Ban,
  RotateCcw,
  UserCog,
  Gift,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { CashierOrder } from '@/lib/cashier-queue';
import { PrintDeliveryNoteButton } from '@/components/(dashboard)/orders/print-delivery-note-button';
import { ReceiptActions } from '@/components/(dashboard)/orders/receipt-actions';
import { getPickupCode } from '@/lib/orders/format';
import { CopyRecapButton } from '../../../_components/copy-recap-button';
import type { CaisseContactSettings } from './types';
import type { OrderActions } from './use-order-actions';
import type { OrderView } from './use-order-view';

export function EditSection({
  order,
  view,
  actions,
  contactSettings,
}: {
  order: CashierOrder;
  view: OrderView;
  actions: OrderActions;
  contactSettings: CaisseContactSettings;
}) {
  const { canEditItems, canEditLoyalty, trackingUrl } = view;
  const {
    isPending,
    actionError,
    setIsEditOpen,
    setIsEditFulfillmentOpen,
    setIsEditCustomerOpen,
    setIsEditLoyaltyOpen,
    handleCancelOrRefund,
  } = actions;
  return (
    <>
      {/* Copier le récap + lien Wave (fonctionne même sans téléphone) */}
      <CopyRecapButton
        customerName={order.customerName}
        dailyNumber={order.dailyNumber}
        reference={order.reference}
        amount={order.total}
        items={order.items}
        loyaltyDiscount={order.loyaltyDiscount}
        contactSettings={contactSettings}
        trackingUrl={trackingUrl}
      />

      {/* Bon de livraison (sans prix) pour le livreur + reçu PDF du client */}
      <PrintDeliveryNoteButton orderId={order.id} fullWidth />
      <ReceiptActions
        orderId={order.id}
        code={getPickupCode(order.reference)}
        customerPhone={order.customerPhone}
        fullWidth
      />

      {/* Ajouter / retirer des produits */}
      {canEditItems && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-muted-foreground"
          onClick={() => setIsEditOpen(true)}
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          Modifier les articles
        </Button>
      )}

      {/* Prise en charge : type, créneau, livreur */}
      {canEditItems && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-muted-foreground"
          onClick={() => setIsEditFulfillmentOpen(true)}
        >
          <CalendarClock className="mr-1.5 h-4 w-4" />
          Modifier la prise en charge
        </Button>
      )}

      {/* Infos client : nom, téléphone, fiche CRM */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full text-muted-foreground"
        onClick={() => setIsEditCustomerOpen(true)}
      >
        <UserCog className="mr-1.5 h-4 w-4" />
        Modifier le client
      </Button>

      {/* Récompense fidélité, même sur une commande terminée */}
      {canEditLoyalty && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-muted-foreground"
          onClick={() => setIsEditLoyaltyOpen(true)}
        >
          <Gift className="mr-1.5 h-4 w-4" />
          Récompense fidélité
        </Button>
      )}

      {/* Annuler (non payée) ou Rembourser (payée) : un remboursement se demande
          depuis la fiche de la commande (articles, montant, motif, validation admin). */}
      {order.status !== 'CANCELLED' &&
        (order.isPaid ? (
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Link href={`/dashboard/commandes/${order.id}?rembourser=1`}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Rembourser…
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={handleCancelOrRefund}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            Annuler
          </Button>
        ))}

      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
    </>
  );
}
