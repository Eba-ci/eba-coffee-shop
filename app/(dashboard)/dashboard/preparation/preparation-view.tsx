'use client';

import { useState } from 'react';
import {
  markOrderPaidFromKitchen,
  setOrderCustomerFromKitchen,
} from './actions';
import { UndoToastProvider } from '@/lib/hooks/use-undo-toast';
import { type PreparationOrder } from '@/lib/preparation-queue';
import type { MenuCategory } from '@/config/menu';
import type { ContactSettings } from '@/lib/contact-settings';
import {
  useOrdersStream,
  useSoundPreference,
} from '@/lib/hooks/use-orders-stream';
import { useNowTick } from '@/lib/hooks/use-now-tick';
import { PreparationHeader } from './_components/preparation-header';
import { EmptyState } from './_components/empty-state';
import { PreparationBanners } from './_components/view/banners';
import { ToLaunchSection } from './_components/to-launch-section';
import { CookingGrid } from './_components/group/cooking-grid';
import { groupMates } from '@/lib/orders/kitchen-group';
import { OrderDetailSheet } from './_components/order-detail-sheet';
import { OrdersListSheet } from './_components/orders-list-sheet';
import { ProductionSheet } from './_components/production-sheet';
import { OrdersSearchSheet } from './_components/orders-search-sheet';
import { normalize } from './_components/view/normalize';
import { useCreatedFlash } from './_components/view/use-created-flash';
import { usePreparationActions } from './_components/view/use-preparation-actions';
import { usePreparationLists } from './_components/view/use-preparation-lists';

const SSE_URL = '/api/preparation/stream';

export function PreparationView(props: {
  initialQueue: PreparationOrder[];
  menu: MenuCategory[];
  contactSettings: Pick<ContactSettings, 'yangoLandmark' | 'phone'>;
}) {
  return (
    <UndoToastProvider>
      <PreparationViewInner {...props} />
    </UndoToastProvider>
  );
}

function PreparationViewInner({
  initialQueue,
  menu,
  contactSettings,
}: {
  initialQueue: PreparationOrder[];
  menu: MenuCategory[];
  contactSettings: Pick<ContactSettings, 'yangoLandmark' | 'phone'>;
}) {
  // Commande agrandie dans le bottom sheet de détail (null = fermé).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bottom sheet de liste ouvert, null = aucun.
  const [openSheet, setOpenSheet] = useState<
    'scheduled' | 'ready' | 'topay' | 'production' | 'search' | null
  >(null);
  const { soundEnabled, toggleSound } = useSoundPreference();
  const now = useNowTick(15_000);
  const { createdFlash, setCreatedFlash } = useCreatedFlash();

  const { orders, connState, isStale, lastSync } =
    useOrdersStream<PreparationOrder>({
      endpoint: SSE_URL,
      initialOrders: initialQueue,
      normalize,
      getId: (o) => o.id,
    });

  const actions = usePreparationActions(orders);
  const {
    isPending,
    optimisticHidden,
    pendingIds,
    launchError,
    shortageDialog,
    handleReady,
    handleRetrieved,
    handleStartPreparation,
    handleStartMany,
    handleRequestDriver,
    handleReadyMany,
    handleRequestDriverMany,
    handleRetrievedMany,
    handleCancel,
  } = actions;
  const {
    visible,
    cooking,
    scheduled,
    productionPlan,
    toLaunchCount,
    toLaunchUrgent,
    toLaunchToday,
    ready,
    toPay,
    groups,
    readyAlert,
    selected,
  } = usePreparationLists(orders, optimisticHidden, selectedId, now);

  // Groupe de la commande agrandie (retrouvé par client) : alimente « À emballer avec … » dans le détail.
  const selectedGroup = selected
    ? [...groups.values()].find((g) =>
        g.orders.some((o) => o.id === selected.id)
      )
    : undefined;

  // Carillon quand une programmée du jour devient « prête à lancer » (stock réservé en entier).

  // Grille principale vide : plus aucune commande à cuisiner maintenant.
  const isEmpty = cooking.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <PreparationHeader
        counts={{
          cooking: cooking.length,
          scheduled: scheduled.length,
          ready: ready.length,
          // Premier jour chargé : « ce qu'il y a à faire là, tout de suite », pas un total de la semaine.
          production: productionPlan[0]?.totalItems ?? 0,
          toPay: toPay.length,
        }}
        readyAlert={readyAlert}
        toLaunchCount={toLaunchCount}
        toLaunchUrgent={toLaunchUrgent}
        connState={connState}
        isStale={isStale}
        lastSync={lastSync}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onOpenScheduled={() => setOpenSheet('scheduled')}
        onOpenReady={() => setOpenSheet('ready')}
        onOpenProduction={() => setOpenSheet('production')}
        onOpenToPay={() => setOpenSheet('topay')}
        onOpenSearch={() => setOpenSheet('search')}
      />

      <PreparationBanners
        createdFlash={createdFlash}
        onDismissFlash={() => setCreatedFlash(null)}
        launchError={launchError}
      />

      <div className="pt-4">
        <ToLaunchSection
          ready={toLaunchToday.ready}
          waiting={toLaunchToday.waiting}
          urgent={toLaunchToday.urgent}
          lateWaiting={toLaunchToday.lateWaiting}
          now={now}
          pendingIds={pendingIds}
          isPending={isPending}
          onExpand={setSelectedId}
          onRetrieve={handleRetrieved}
          onCancel={handleCancel}
          onStartPreparation={handleStartPreparation}
          onStartMany={handleStartMany}
        />
      </div>

      {isEmpty ? (
        toLaunchToday.ready.length + toLaunchToday.waiting.length === 0 && (
          <div className="flex flex-1 pt-4">
            <EmptyState />
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col gap-5 pt-4">
          {/* À cuisiner maintenant ; toucher une carte l'agrandit dans le bottom sheet de détail. */}
          <CookingGrid
            cooking={cooking}
            groups={groups}
            now={now}
            pendingIds={pendingIds}
            isPending={isPending}
            contactSettings={contactSettings}
            onExpand={setSelectedId}
            onReady={handleReady}
            onCancel={handleCancel}
            onRequestDriver={handleRequestDriver}
            onRetrieve={handleRetrieved}
            onReadyMany={handleReadyMany}
            onRequestDriverMany={handleRequestDriverMany}
          />
        </div>
      )}

      {/* Détail agrandi (lisible de loin), ouvert au toucher d'une carte/ligne. */}
      <OrderDetailSheet
        order={selected}
        menu={menu}
        now={now}
        pending={selected ? pendingIds.has(selected.id) || isPending : false}
        contactSettings={contactSettings}
        onClose={() => setSelectedId(null)}
        onReady={(id) => {
          setSelectedId(null);
          handleReady(id);
        }}
        onCancel={(id) => {
          setSelectedId(null);
          handleCancel(id);
        }}
        onRequestDriver={handleRequestDriver}
        onRetrieve={(id) => {
          setSelectedId(null);
          handleRetrieved(id);
        }}
        payAction={markOrderPaidFromKitchen}
        customerAction={setOrderCustomerFromKitchen}
        mates={selectedGroup ? groupMates(selectedGroup, selected!) : []}
        groupKey={selectedGroup?.key}
      />

      {/* Commandes hors du travail courant, rangées dans des bottom sheets. */}
      <OrdersListSheet
        variant="scheduled"
        orders={scheduled}
        now={now}
        open={openSheet === 'scheduled'}
        onOpenChange={(o) => setOpenSheet(o ? 'scheduled' : null)}
        onExpand={setSelectedId}
        pendingIds={pendingIds}
        onRetrieve={handleRetrieved}
        onStartPreparation={handleStartPreparation}
        onCancel={handleCancel}
      />
      <ProductionSheet
        plan={productionPlan}
        open={openSheet === 'production'}
        onOpenChange={(o) => setOpenSheet(o ? 'production' : null)}
      />
      <OrdersListSheet
        variant="ready"
        groups={groups}
        onRetrieveMany={handleRetrievedMany}
        orders={ready}
        now={now}
        open={openSheet === 'ready'}
        onOpenChange={(o) => setOpenSheet(o ? 'ready' : null)}
        onExpand={setSelectedId}
        pendingIds={pendingIds}
        onRetrieve={handleRetrieved}
        onCancel={handleCancel}
      />
      <OrdersListSheet
        variant="topay"
        orders={toPay}
        now={now}
        open={openSheet === 'topay'}
        onOpenChange={(o) => setOpenSheet(o ? 'topay' : null)}
        onExpand={setSelectedId}
        pendingIds={pendingIds}
        onRetrieve={handleRetrieved}
        onCancel={handleCancel}
        action={markOrderPaidFromKitchen}
      />
      <OrdersSearchSheet
        orders={visible}
        groups={groups}
        pendingIds={pendingIds}
        onReady={handleReady}
        onCancel={handleCancel}
        onRetrieve={handleRetrieved}
        onStartPreparation={handleStartPreparation}
        onReadyMany={handleReadyMany}
        onRetrieveMany={handleRetrievedMany}
        now={now}
        open={openSheet === 'search'}
        onOpenChange={(o) => setOpenSheet(o ? 'search' : null)}
        onSelect={(id) => {
          setOpenSheet(null);
          setSelectedId(id);
        }}
      />
      {shortageDialog}
    </div>
  );
}
