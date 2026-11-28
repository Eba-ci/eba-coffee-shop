import { Suspense } from 'react';
import { type SearchParams } from 'nuqs/server';
import { Download } from 'lucide-react';
import { requireRoleOrAnalyst, ROLE_GROUPS } from '@/lib/auth-helpers';
import { Button } from '@/components/ui/button';
import { CustomerSearch } from './customer-search';
import { CustomerViews } from './customer-views';
import { CustomerFormSheet } from './customer-form';
import { loadClientsSearchParams } from './search-params';
import { SummaryCards, SummaryCardsSkeleton } from './summary-cards';
import {
  CustomersSection,
  CustomersSectionSkeleton,
} from './customers-section';

export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRoleOrAnalyst(['ADMIN']);
  // Export en masse des numéros : mêmes rôles que la route (l'ANALYSTE lit la
  // liste, il n'emporte pas le répertoire).
  const canExportContacts = ROLE_GROUPS.MANAGER_PLUS.includes(
    session.user.role
  );
  // Même définition de paramètres que le client (search-params.ts) : une page
  // « abc » ou un tri inconnu retombe sur le défaut au lieu de partir en base.
  const filters = await loadClientsSearchParams(searchParams);

  // La page n'attend plus aucune lecture : chaque zone (tuiles, tableau) se
  // charge dans son propre `Suspense`, l'en-tête et la recherche restent
  // immédiatement utilisables.
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CustomerSearch />
          {canExportContacts && (
            <>
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/customers?format=csv">
                  <Download className="mr-1.5 h-4 w-4" />
                  CSV Google Contacts
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/customers?format=vcf">
                  <Download className="mr-1.5 h-4 w-4" />
                  Fichier .vcf
                </a>
              </Button>
            </>
          )}
          <CustomerFormSheet mode="create" />
        </div>
      </div>

      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryCards />
      </Suspense>

      <CustomerViews />

      <Suspense fallback={<CustomersSectionSkeleton />}>
        <CustomersSection filters={filters} />
      </Suspense>
    </div>
  );
}
