// Répartitions (type de commande, mode de paiement, statut, top produits,
// dépenses par catégorie). Réutilise `compareRangesCached` (déjà appelé par
// kpi-section pour les mêmes from/to — dédupliqué par React `cache()`, donc
// aucune requête DB supplémentaire ici).

import { getTopProducts } from '@/lib/stats';
import { compareRangesCached } from '@/lib/stats-compare';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrdersByTypeChart } from '@/components/(dashboard)/charts/orders-by-type-chart';
import { PaymentModeChart } from '@/components/(dashboard)/charts/payment-mode-chart';
import { StatusBreakdownChart } from '@/components/(dashboard)/charts/status-breakdown-chart';
import { TopProductsChart } from '@/components/(dashboard)/charts/top-products-chart';
import { ExpensesByCategoryChart } from '@/components/(dashboard)/charts/expenses-by-category-chart';

export async function BreakdownsSection({
  from,
  to,
}: {
  from: Date;
  to: Date;
}) {
  const [comparison, topProducts] = await Promise.all([
    compareRangesCached(from, to),
    getTopProducts(from, to),
  ]);
  const stats = comparison.current;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Type de commande</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersByTypeChart counts={stats.countByOrderType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CA par mode de paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentModeChart revenueByMode={stats.revenueByPaymentMode} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commandes par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdownChart counts={stats.countByStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top produits</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={topProducts} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dépenses par catégorie</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpensesByCategoryChart
              data={comparison.expenses.current.byCategory}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
