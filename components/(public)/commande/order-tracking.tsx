'use client';

// Page de suivi vivante d'une commande (/commande/:id) : statut en direct par
// polling, code de retrait, paiement, livreur. Le client transmet le code de
// retrait à son livreur.

import { useReducedMotion } from 'framer-motion';
import type { PublicOrderView } from '@/lib/orders';
import { OrderNotifications } from '@/components/(public)/commande/order-notifications';
import { OrderNotificationsModal } from '@/components/(public)/commande/order-notifications-modal';
import { PaymentSection } from '@/components/(public)/commande/payment-section';
import type { PaymentReturn } from '@/lib/orders/payment-panel';
import { deferredPickupLabel } from '@/lib/orders/scheduling';
import { STATUS_INDEX } from './tracking/constants';
import { DriverSection } from './tracking/driver-section';
import { LoyaltySection } from './tracking/loyalty-section';
import { OrderItemsSection } from './tracking/order-items-section';
import { PickupCodeCard } from './tracking/pickup-code-card';
import { PickupPlace } from './tracking/pickup-place';
import {
  CancelledBanner,
  DeferredBanner,
  StockAlert,
} from './tracking/status-banners';
import { StatusTimeline } from './tracking/status-timeline';
import { useOrderTracking } from './tracking/use-order-tracking';

type Props = {
  initialOrder: PublicOrderView;
  pickupAddress: string | null;
  pickupMapsUrl: string | null;
  whatsapp: string;
  /** Retour de chez Jèko, lu dans `?paiement=` par la page serveur. */
  paymentReturn: PaymentReturn;
};

export function OrderTracking({
  initialOrder,
  pickupAddress,
  pickupMapsUrl,
  whatsapp,
  paymentReturn,
}: Props) {
  const reduceMotion = useReducedMotion();
  const {
    order,
    refresh,
    trackingUrl,
    isCancelled,
    paymentExpired,
    isFinal,
    pickupCode,
    hasUnavailableItem,
    paymentBlocking,
  } = useOrderTracking(initialOrder, paymentReturn);

  const currentStep = STATUS_INDEX[order.status] ?? 0;
  // Retrait un jour ultérieur : la commande reste « Reçue » jusqu'au jour J.
  const deferred = deferredPickupLabel(order, new Date());

  return (
    <div className="flex flex-col gap-5">
      {/* ── En-tête : état courant ── */}
      {isCancelled ? (
        <CancelledBanner paymentExpired={paymentExpired} />
      ) : (
        <StatusTimeline currentStep={currentStep} reduceMotion={reduceMotion} />
      )}

      {/* ── Commande pour un autre jour ── */}
      {!isCancelled && deferred && <DeferredBanner deferred={deferred} />}

      {/* ── Notifications push (statuts en direct) ── */}
      <OrderNotifications orderId={order.id} isFinal={isFinal} />
      <OrderNotificationsModal
        orderId={order.id}
        isFinal={isFinal}
        pickupCode={pickupCode}
      />

      {/* ── Alerte stock (uniquement avant paiement) ── */}
      {!isCancelled && hasUnavailableItem && <StockAlert />}

      {/* ── Payée après annulation ou expiration : le client doit le savoir ── */}
      {isCancelled && order.isPaid && (
        <PaymentSection
          order={order}
          whatsapp={whatsapp}
          paymentReturn={paymentReturn}
          onRefresh={refresh}
        />
      )}

      {/* ── Paiement (prioritaire tant qu'il bloque la préparation) ── */}
      {!isCancelled && paymentBlocking && (
        <PaymentSection
          order={order}
          whatsapp={whatsapp}
          paymentReturn={paymentReturn}
          onRefresh={refresh}
        />
      )}

      <PickupCodeCard
        order={order}
        pickupCode={pickupCode}
        isFinal={isFinal}
        trackingUrl={trackingUrl}
      />

      {/* ── Fidélité ── */}
      {!isCancelled && order.loyalty && (
        <LoyaltySection loyalty={order.loyalty} />
      )}

      {/* ── Paiement (position normale une fois qu'il ne bloque plus) ── */}
      {!isCancelled && !paymentBlocking && (
        <PaymentSection
          order={order}
          whatsapp={whatsapp}
          paymentReturn={paymentReturn}
          onRefresh={refresh}
        />
      )}

      {/* ── Livreur ── */}
      {!isCancelled && (
        <DriverSection
          order={order}
          isFinal={isFinal}
          pickupAddress={pickupAddress}
          pickupMapsUrl={pickupMapsUrl}
          pickupCode={pickupCode}
          trackingUrl={trackingUrl}
        />
      )}

      <OrderItemsSection order={order} />

      {!isCancelled && order.isPaid && (
        <a
          href={`/api/orders/${order.id}/receipt`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-divider py-3 text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Télécharger mon reçu (PDF)
        </a>
      )}

      {(pickupAddress || pickupMapsUrl) && (
        <PickupPlace
          pickupAddress={pickupAddress}
          pickupMapsUrl={pickupMapsUrl}
        />
      )}
    </div>
  );
}
