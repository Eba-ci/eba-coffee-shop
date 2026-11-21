'use client';

import { useMemo } from 'react';
import type { CashierOrder } from '@/lib/cashier-queue';
import type { MenuCategory } from '@/config/menu';
import {
  useOrdersStream,
  useSoundPreference,
} from '@/lib/hooks/use-orders-stream';
import { buildCustomerGroups } from '@/lib/orders/customer-groups';
import { parseOrderSearchTerm, searchOrders } from '@/lib/orders/search';
import { pickFirstCriticalTab, type TabKey } from './urgency';
import { useNowTick } from './use-now-tick';
import { useCaisseParams } from './use-caisse-params';
import { CaisseHeader } from './_components/caisse-header';
import { CaisseSearch } from './_components/caisse-search';
import { CaisseSearchResults } from './_components/caisse-search-results';
import { AlertBanner } from './_components/alert-banner';
import { ScheduledSection } from './_components/scheduled-section';
import { UrgencyTabs } from './_components/urgency-tabs';
import {
  filterByTab,
  filterScheduledAhead,
  useUrgencyCounts,
} from './_components/use-urgency-counts';
import {
  CreatedFlashBanner,
  ReadyFlashBanner,
} from './_components/view/flash-banners';
import { normalize } from './_components/view/normalize';
import { useCaisseAlerts } from './_components/view/use-caisse-alerts';
import { useCreatedFlash } from './_components/view/use-created-flash';
import { UndoToastProvider } from '@/lib/hooks/use-undo-toast';
import type { CaisseContactSettings } from './_components/actions/types';

const SSE_URL = '/api/caisse/stream';

export function CaisseView({
  initialQueue,
  menu,
  contactSettings,
  cashierName,
}: {
  initialQueue: CashierOrder[];
  menu: MenuCategory[];
  contactSettings: CaisseContactSettings;
  cashierName: string;
}) {
  const { tab, setTab, search, setSearch } = useCaisseParams();
  const { soundEnabled, toggleSound } = useSoundPreference();
  const now = useNowTick(30_000);
  const { createdFlash, setCreatedFlash } = useCreatedFlash();

  const {
    orders: queue,
    connState,
    isStale,
  } = useOrdersStream<CashierOrder>({
    endpoint: SSE_URL,
    initialOrders: initialQueue,
    normalize,
    getId: (o) => o.id,
  });

  const { urgencyIndex, counts } = useUrgencyCounts(queue, now);

  const criticalTotal =
    counts['to-pay'].critical +
    counts['in-progress'].critical +
    counts.ready.critical;

  const { readyFlash, setReadyFlash } = useCaisseAlerts({
    initialQueue,
    queue,
  });

  const scheduledOrders = useMemo(
    () => filterScheduledAhead(queue, now),
    [queue, now]
  );

  // Clients à plusieurs commandes : calculé sur toute la file (pas l'onglet) pour que
  // l'en-tête de groupe dise l'état de TOUTES leurs commandes.
  const groups = useMemo(() => buildCustomerGroups(queue, now), [queue, now]);

  const visibleOrders = useMemo(
    () => filterByTab(queue, tab, now),
    [queue, tab, now]
  );

  // Recherche : purement client. `queue` porte déjà toute la file du jour
  // (à encaisser + en cours + prêtes + programmées), donc le résultat est
  // inter-onglets sans aucun aller-retour serveur.
  const parsedSearch = useMemo(() => parseOrderSearchTerm(search), [search]);
  // Classés par pertinence : un code de retrait exact sort seul, en tête,
  // même s'il est tout en bas de la file.
  const results = useMemo(
    () => (parsedSearch ? searchOrders(queue, parsedSearch) : []),
    [queue, parsedSearch]
  );
  const searching = parsedSearch !== null;

  function handleBannerSeeClick() {
    const criticals: Record<TabKey, number> = {
      'to-pay': counts['to-pay'].critical,
      'in-progress': counts['in-progress'].critical,
      ready: counts.ready.critical,
    };
    const target = pickFirstCriticalTab(criticals);
    if (target) setTab(target);
  }

  return (
    <UndoToastProvider>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4">
        <CaisseHeader
          cashierName={cashierName}
          connState={connState}
          isStale={isStale}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />

        {createdFlash && (
          <CreatedFlashBanner
            createdFlash={createdFlash}
            onClose={() => setCreatedFlash(null)}
          />
        )}

        {readyFlash && readyFlash.length > 0 && (
          <ReadyFlashBanner
            readyFlash={readyFlash}
            onClose={() => setReadyFlash(null)}
          />
        )}

        <CaisseSearch value={search} onChange={setSearch} />

        {/* En recherche, on remplace tout le flux de travail par les résultats :
            le staff cherche UNE commande précise (livreur au comptoir), pas un
            aperçu de la journée. */}
        {searching ? (
          <CaisseSearchResults
            orders={results}
            urgencyIndex={urgencyIndex}
            term={search.trim()}
            groups={groups}
            menu={menu}
            contactSettings={contactSettings}
            now={now}
          />
        ) : (
          <>
            {criticalTotal > 0 && (
              <AlertBanner
                counts={counts}
                activeTab={tab}
                onSeeClick={handleBannerSeeClick}
              />
            )}

            <ScheduledSection
              orders={scheduledOrders}
              menu={menu}
              contactSettings={contactSettings}
              now={now}
            />

            <UrgencyTabs
              tab={tab}
              onTabChange={setTab}
              counts={counts}
              visibleOrders={visibleOrders}
              menu={menu}
              contactSettings={contactSettings}
              now={now}
              groups={groups}
            />
          </>
        )}
      </div>
    </UndoToastProvider>
  );
}
