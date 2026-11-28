// Tableau des clients + compteur + pagination. Composant serveur autonome (son
// propre `Suspense` dans la page) : il ne dépend que des paramètres d'URL, pas
// des tuiles de synthèse. Les chiffres par client viennent de la même requête que
// les lignes (jointure), cf. `lib/customers/list.ts`.

import { listCustomers, periodStart } from '@/lib/customers';
import { Pagination } from '@/components/(dashboard)/pagination';
import { TableSkeleton } from '@/components/(dashboard)/skeletons';
import { CustomersTable } from './customers-table';
import type { loadClientsSearchParams } from './search-params';

export async function CustomersSection({
  filters,
}: {
  filters: Awaited<ReturnType<typeof loadClientsSearchParams>>;
}) {
  const query = {
    search: filters.search?.trim() || undefined,
    page: filters.page,
    sort: filters.sort ?? undefined,
    dir: filters.dir,
    view: filters.vue ?? undefined,
    // La période n'a de sens qu'avec une vue : seule la vue la lit.
    since: filters.vue ? periodStart(filters.periode) : undefined,
  };
  const { customers, total, pageSize } = await listCustomers(query, {
    withStats: true,
  });
  const totalPages = Math.ceil(total / pageSize);
  // Rang dans le classement (vue active, ordre décroissant) : 1, 2, 3… sur toutes les pages.
  const rankFrom =
    filters.vue && filters.dir === 'desc'
      ? (filters.page - 1) * pageSize + 1
      : undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {filters.vue
          ? `${total} client${total > 1 ? 's' : ''} dans cette vue.`
          : `${total} client${total > 1 ? 's' : ''} identifié${total > 1 ? 's' : ''} par téléphone.`}
      </p>
      <CustomersTable customers={customers} rankFrom={rankFrom} />
      {totalPages > 1 && <Pagination totalPages={totalPages} />}
    </div>
  );
}

export function CustomersSectionSkeleton() {
  return <TableSkeleton rows={10} withToolbar={false} />;
}
