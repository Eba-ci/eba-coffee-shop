// Onglet « Point mort » : navigation par mois, résumé et projection, KPI du
// jour, graphique, suivi jour par jour (calendrier / liste) et liste des
// charges fixes. Le calcul vit dans lib/fixed-costs (pur) ; ici, seulement
// l'assemblage.

import Link from 'next/link';
import { CalendarOff, Gauge, Target, Wallet } from 'lucide-react';
import {
  MARGIN_WINDOW_DAYS,
  getMonthReport,
  listFixedCosts,
} from '@/lib/fixed-costs/queries';
import { MARGIN_ESTIMATE_WINDOW_DAYS } from '@/config/constants';
import { projectMonthEnd, summarizeMonth } from '@/lib/fixed-costs/month';
import { todayDateString } from '@/lib/timezone';
import { listExpenseCategories } from '@/lib/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/(dashboard)/kpi-card';
import { FixedCostManager } from '../fixed-cost-manager';
import { BreakEvenChart } from '@/components/(dashboard)/charts/break-even-chart';
import { toChartPoints } from '@/lib/fixed-costs/chart';
import { MonthNav } from './point-mort/month-nav';
import { MonthSummaryBar } from './point-mort/month-summary';
import { PointMortDays } from './point-mort/point-mort-days';

const fmt = new Intl.NumberFormat('fr-FR');
const f = (n: number | null) => (n === null ? '—' : `${fmt.format(n)} F`);

export async function PointMortSection({ month }: { month: string }) {
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);
  const [report, costs, categories] = await Promise.all([
    getMonthReport(month),
    listFixedCosts(),
    listExpenseCategories(),
  ]);
  const todayRow = report.today;
  const summary = summarizeMonth(report.days, today);
  const projection = projectMonthEnd(report.days, today, report.margin.rate);
  const noCostThisMonth = report.days.every((d) => d.fixedCost === 0);
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

      <MonthNav month={month} currentMonth={currentMonth} />

      {todayRow && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Charges fixes du jour"
            value={todayRow.open ? f(todayRow.fixedCost) : 'Fermé'}
            Icon={todayRow.open ? Wallet : CalendarOff}
            hint={
              todayRow.open
                ? `${report.costCount} charge(s) active(s)`
                : 'Aucune charge un jour fermé'
            }
          />
          <KpiCard
            label="Point mort du jour"
            value={todayRow.open ? f(todayRow.target) : '0 F'}
            Icon={Target}
            hint={
              todayRow.open && todayRow.catchUp > 0
                ? `dont ${f(todayRow.catchUp)} de rattrapage`
                : marginPct === null
                  ? 'Marge non calculable'
                  : report.margin.source === 'expenses'
                    ? `Marge estimée ${marginPct} % (dépenses, ${MARGIN_ESTIMATE_WINDOW_DAYS} j)`
                    : `Marge ${marginPct} % sur ${MARGIN_WINDOW_DAYS} j`
            }
          />
          <KpiCard
            label="CA net du jour"
            value={f(todayRow.revenue)}
            Icon={Gauge}
          />
          <KpiCard
            label="Reste à faire"
            value={todayRow.open ? f(todayRow.remaining) : '—'}
            Icon={Target}
            hint={
              todayRow.reached === true
                ? 'Seuil atteint ✓'
                : todayRow.reached === false
                  ? 'Seuil non atteint'
                  : undefined
            }
          />
        </div>
      )}

      {report.margin.source === 'expenses' && (
        <p className="text-sm text-muted-foreground">
          Marge estimée d’après tes dépenses d’achat des{' '}
          {MARGIN_ESTIMATE_WINDOW_DAYS} derniers jours : moins de 50 % du CA a
          un coût de revient renseigné (couverture{' '}
          {Math.round(report.margin.coverage * 100)} %). Le seuil est indicatif
          ; renseigne les coûts matière / emballage des produits pour un seuil
          précis.
        </p>
      )}

      {report.margin.rate === null && (
        <p className="text-sm text-muted-foreground">
          Marge non calculable : moins de 50 % du CA des 30 derniers jours a un
          coût de revient renseigné (couverture{' '}
          {Math.round(report.margin.coverage * 100)} %). Renseigne les coûts
          matière / emballage des produits pour obtenir un seuil.
        </p>
      )}

      {noCostThisMonth && report.costCount === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Aucune charge fixe active : ajoute-en une plus bas (ou importe tes
          dépenses récurrentes) pour voir le point mort.
        </p>
      )}
      {noCostThisMonth && report.costCount > 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Aucune charge fixe ne s’applique à ce mois (prise d’effet plus tardive
          ou fin passée). Voir la liste des charges plus bas.
        </p>
      )}

      <MonthSummaryBar
        summary={summary}
        projection={projection}
        isCurrentMonth={month === currentMonth}
      />

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
          <CardTitle className="text-base">Suivi jour par jour</CardTitle>
        </CardHeader>
        <CardContent>
          <PointMortDays days={report.days} today={today} />
        </CardContent>
      </Card>

      <Card id="charges-fixes">
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
              installments: c.installments,
            }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
