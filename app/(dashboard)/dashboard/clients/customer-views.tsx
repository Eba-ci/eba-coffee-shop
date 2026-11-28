'use client';

// Vues rapides de la liste (Meilleurs / Plus fidèles / Réguliers) + période.
// État dans l'URL (nuqs, cf. `use-clients-nav.ts`) : une vue est un lien
// partageable. Choisir une vue repart du tri de la vue (`sort`/`dir` effacés) ;
// la période n'apparaît qu'avec une vue.

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CUSTOMER_PERIODS,
  CUSTOMER_PERIOD_LABELS,
  CUSTOMER_VIEWS,
  CUSTOMER_VIEW_LABELS,
  type CustomerPeriod,
  type CustomerView,
} from '@/lib/customers/views';
import { useClientsNav } from './use-clients-nav';

const ALL = 'all';

export function CustomerViews() {
  const { filters, update } = useClientsNav();

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {/* Défilement local : sur mobile les onglets ne doivent pas élargir la page. */}
      <div className="min-w-0 max-w-full overflow-x-auto">
        <Tabs
          value={filters.vue ?? ALL}
          onValueChange={(value) =>
            update({
              vue: value === ALL ? null : (value as CustomerView),
              sort: null,
              dir: null,
              periode: value === ALL ? null : filters.periode,
            })
          }
          className="w-fit"
        >
          <TabsList>
            <TabsTrigger value={ALL}>Tous</TabsTrigger>
            {CUSTOMER_VIEWS.map((view) => (
              <TabsTrigger key={view} value={view}>
                {CUSTOMER_VIEW_LABELS[view]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {filters.vue && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Période</span>
          <div className="min-w-0 max-w-full overflow-x-auto">
            <Tabs
              value={filters.periode ?? ALL}
              onValueChange={(value) =>
                update({
                  periode: value === ALL ? null : (value as CustomerPeriod),
                })
              }
              className="w-fit"
            >
              <TabsList>
                <TabsTrigger value={ALL}>Tout</TabsTrigger>
                {CUSTOMER_PERIODS.map((p) => (
                  <TabsTrigger key={p} value={p}>
                    {CUSTOMER_PERIOD_LABELS[p]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
