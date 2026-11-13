import { requireInventoryAdmin } from '@/lib/auth-helpers';
import { listInventoryItems, listLastPurchaseCosts } from '@/lib/inventory';
import { listExpenseCategories } from '@/lib/expenses';
import { BackButton } from '@/components/(dashboard)/back-button';

import { RestockView, type LastCost } from './restock-view';

// Page d'administration : données live, jamais prérendue.
export const dynamic = 'force-dynamic';

export default async function ReapproPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;
  const [, items, expenseCats, costs] = await Promise.all([
    requireInventoryAdmin(),
    listInventoryItems(),
    listExpenseCategories(),
    listLastPurchaseCosts(),
  ]);

  // Le pré-remplissage est résolu ICI, pas transporté par l'URL : le lien
  // depuis l'alerte « stock bas » ne dit que son intention.
  const prefillLowStock = prefill === 'bas';

  const lastCosts: Record<string, LastCost> = {};
  for (const [itemId, cost] of costs) lastCosts[itemId] = cost;

  return (
    <div className="space-y-4">
      <div>
        <BackButton
          fallbackHref="/dashboard/inventaire"
          label="Inventaire"
          className="-ml-3 mb-2"
        />
        <h1 className="text-xl font-bold">Réapprovisionnement</h1>
        {prefillLowStock && (
          <p className="text-sm text-muted-foreground">
            Pré-rempli avec les références sous le seuil, quantités suggérées
            pour repasser au-dessus.
          </p>
        )}
      </div>

      <RestockView
        items={items}
        expenseCategories={expenseCats.map((c) => ({ id: c.id, name: c.name }))}
        lastCosts={lastCosts}
        prefillLowStock={prefillLowStock}
      />
    </div>
  );
}
