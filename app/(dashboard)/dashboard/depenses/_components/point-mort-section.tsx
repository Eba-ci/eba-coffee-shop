// Onglet « Point mort » : KPI du jour, tableau jour par jour, liste des
// charges fixes. Le calcul vit dans lib/fixed-costs (pur) ; ici, seulement
// l'assemblage.

import Link from 'next/link';
import { CalendarOff, Gauge, Target, Wallet } from 'lucide-react';
import { getBreakEvenReport, listFixedCosts } from '@/lib/fixed-costs/queries';
import { listExpenseCategories } from '@/lib/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/(dashboard)/kpi-card';
import { FixedCostManager } from '../fixed-cost-manager';
import { BreakEvenChart } from '@/components/(dashboard)/charts/break-even-chart';
import { toChartPoints } from '@/lib/fixed-costs/chart';
import { PointMortTable } from './point-mort-table';

const fmt = new Intl.NumberFormat('fr-FR');
const f = (n: number | null) => (n === null ? '—' : `${fmt.format(n)} F`);

export async function PointMortSection({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const [report, costs, categories] = await Promise.all([
    getBreakEvenReport(from, to),
    listFixedCosts(),
    listExpenseCategories(),
  ]);
  const today = report.today;
  const marginPct =
    report.margin.rate === null ? null : Math.round(report.margin.rate * 100);

  return (
    <div className="space-y-4">
      {report.hoursMissing && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Aucun jour d’ouverture dans tes horaires : les charges ne peuvent pas
          être réparties.{' '}
          <Link href="/dashboard/parametres" className="underline">
            Renseigner les horaires
          </Link>
        </p>
      )}

      {today && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Charges fixes du jour"
            value={today.open ? f(today.fixedCost) : 'Fermé'}
            Icon={today.open ? Wallet : CalendarOff}
            hint={
              today.open
                ? `${report.costCount} charge(s) active(s)`
                : 'Aucune charge un jour fermé'
            }
          />
          <KpiCard
            label="Point mort du jour"
            value={today.open ? f(today.breakEven) : '0 F'}
            Icon={Target}
            hint={
              marginPct === null
                ? 'Marge non calculable'
                : `Marge ${marginPct} % sur ${30} j`
            }
          />
          <KpiCard
            label="CA net du jour"
            value={f(today.revenue)}
            Icon={Gauge}
          />
          <KpiCard
            label="Reste à faire"
            value={today.open ? f(today.remaining) : '—'}
            Icon={Target}
            hint={
              today.reached === true
                ? 'Seuil atteint ✓'
                : today.reached === false
                  ? 'Seuil non atteint'
                  : undefined
            }
          />
        </div>
      )}

      {report.margin.rate === null && (
        <p className="text-sm text-muted-foreground">
          Marge non calculable : moins de 50 % du CA des 30 derniers jours a un
          coût de revient renseigné (couverture{' '}
          {Math.round(report.margin.coverage * 100)} %). Renseigne les coûts
          matière / emballage des produits pour obtenir un seuil.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CA net vs point mort</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakEvenChart data={toChartPoints(report.days)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Suivi jour par jour — {report.totals.daysReached} jour(s) au-dessus
            du seuil sur {report.totals.openDays} ouvré(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Charges : {f(report.totals.fixedCost)} · CA net :{' '}
            {f(report.totals.revenue)} · Résultat estimé :{' '}
            {f(report.totals.result)}
          </p>
          <PointMortTable days={report.days} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charges fixes</CardTitle>
        </CardHeader>
        <CardContent>
          <FixedCostManager
            costs={costs.map((c) => ({
              id: c.id,
              label: c.label,
              amount: c.amount,
              periodicity: c.periodicity,
              startDate: c.startDate,
              endDate: c.endDate,
              active: c.active,
              categoryId: c.categoryId,
              categoryName: c.categoryName,
              linked: c.recurringExpenseId !== null,
            }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
