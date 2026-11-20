// Onglet "Aperçu" : KPIs + récap mensuel. En mode "tout l'historique" (pas de
// borne de date), la borne basse effective est déterminée par une requête
// dédiée (`getEarliestExpenseDate`, un simple MIN(date)) plutôt que d'attendre
// la liste complète des dépenses (chargée par la section "Historique") — les
// deux sections restent ainsi indépendantes, sans waterfall croisée.

import { Landmark, ReceiptText, ShoppingBasket, Wallet } from 'lucide-react';
import {
  getExpenseSummary,
  getExpenseMonthlySeries,
  getEarliestExpenseDate,
} from '@/lib/expenses';
import { todayDateString, parseDateOnlyToUTC } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/(dashboard)/kpi-card';
import { ExpensesByCategoryChart } from '@/components/(dashboard)/charts/expenses-by-category-chart';
import { ExpenseTrendChart } from '@/components/(dashboard)/charts/expense-trend-chart';

const priceFmt = new Intl.NumberFormat('fr-FR');

export async function ApercuSection({
  dateFrom,
  dateTo,
  categoryId,
  paymentMethod,
  search,
}: {
  dateFrom?: Date;
  dateTo?: Date;
  categoryId?: string;
  paymentMethod?: string;
  search?: string;
}) {
  const extra = {
    categoryId,
    paymentMethod: paymentMethod as
      | 'CASH'
      | 'WAVE'
      | 'BANK'
      | 'OTHER'
      | undefined,
    search,
  };

  const today = parseDateOnlyToUTC(todayDateString())!;
  const effectiveFrom =
    dateFrom ?? (await getEarliestExpenseDate(extra)) ?? today;
  const effectiveTo = dateTo ?? today;

  const [summary, monthlySeries] = await Promise.all([
    getExpenseSummary(effectiveFrom, effectiveTo, extra),
    getExpenseMonthlySeries(effectiveFrom, effectiveTo, extra),
  ]);

  // `count`/`total` dérivés de `summary` (pas d'appel séparé à `listExpenses`,
  // dont la section "Historique" est seule responsable).
  const count = summary.byCategory.reduce((sum, c) => sum + c.count, 0);
  const total = summary.total;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total période"
          value={`${priceFmt.format(summary.total)} F`}
          Icon={Wallet}
        />
        <KpiCard
          label="Fixes"
          value={`${priceFmt.format(summary.fixed)} F`}
          Icon={Landmark}
          hint="loyer, salaires, abonnements…"
        />
        <KpiCard
          label="Variables"
          value={`${priceFmt.format(summary.variable)} F`}
          Icon={ShoppingBasket}
          hint="achats, matières premières…"
        />
        <KpiCard
          label="Nombre"
          value={priceFmt.format(count)}
          Icon={ReceiptText}
          hint={
            count > 0
              ? `moyenne : ${priceFmt.format(Math.round(total / count))} F`
              : undefined
          }
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dépenses par mois — fixes vs variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseTrendChart data={monthlySeries} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dépenses par catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpensesByCategoryChart data={summary.byCategory} />
        </CardContent>
      </Card>
    </>
  );
}
