// Onglet « Paiements » : calendrier des échéances du mois (à venir / payé /
// partiel / en retard), liste « à payer cette semaine » et liste des retards.
// Remplace le bandeau d'alerte de #407 : deux charges de même catégorie ne se
// masquent plus. La logique de calcul vit dans lib/fixed-costs (pure).

import { AlertTriangle, Clock, ListChecks, Wallet } from 'lucide-react';
import { getPaymentsView } from '@/lib/fixed-costs/queries';
import {
  summarizeOccurrences,
  unpaid,
  weekBounds,
} from '@/lib/fixed-costs/payments';
import { formatDay } from '@/lib/fixed-costs/format';
import { todayDateString } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/(dashboard)/kpi-card';
import { MonthNav } from '../point-mort/month-nav';
import { PaymentsCalendar } from './payments-calendar';
import { OccurrenceList } from './occurrence-list';

const fmt = new Intl.NumberFormat('fr-FR');
const f = (n: number) => `${fmt.format(n)} F`;

export async function PaymentsSection({ month }: { month: string }) {
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);
  const { month: monthOcc, week, late } = await getPaymentsView(month);
  const weekToPay = unpaid(week);
  const summary = summarizeOccurrences(monthOcc);
  const bounds = weekBounds(today);

  return (
    <div className="space-y-4">
      <MonthNav month={month} currentMonth={currentMonth} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Restant à payer ce mois"
          value={f(summary.remaining)}
          Icon={Wallet}
          hint={`${summary.upcomingCount + summary.partialCount + summary.lateCount} échéance(s) ouverte(s)`}
        />
        <KpiCard
          label="Déjà payé ce mois"
          value={f(summary.paid)}
          Icon={Wallet}
          hint={`${summary.paidCount} échéance(s) réglée(s)`}
        />
        <KpiCard
          label="Échéances du mois"
          value={String(summary.count)}
          Icon={ListChecks}
        />
        <KpiCard
          label="En retard"
          value={String(late.length)}
          Icon={Clock}
          valueClassName={late.length > 0 ? 'text-destructive' : undefined}
        />
      </div>

      {late.length > 0 && (
        <Card className="border-red-300 dark:border-red-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              En retard ({late.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OccurrenceList
              occurrences={late}
              month={month}
              emptyLabel="Aucun retard."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendrier des paiements</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentsCalendar
            month={month}
            today={today}
            occurrences={monthOcc}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            À payer cette semaine
            <span className="ml-1 font-normal text-muted-foreground">
              ({formatDay(bounds.from)} → {formatDay(bounds.to)})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OccurrenceList
            occurrences={weekToPay}
            month={month}
            emptyLabel="Rien à payer cette semaine."
          />
        </CardContent>
      </Card>
    </div>
  );
}
