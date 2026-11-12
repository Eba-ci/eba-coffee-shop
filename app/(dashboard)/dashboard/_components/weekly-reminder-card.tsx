// Bloc « À payer cette semaine » (présentation). Les lignes et le bouton
// « Enregistrer le paiement » sont ceux de l'onglet Paiements : le drawer
// prérempli de #411 vient du `PayDrawerProvider` posé par la section.

import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDay, money } from '@/lib/fixed-costs/format';
import type { WeeklyReminder } from '@/lib/fixed-costs/weekly-reminder';
import { OccurrenceList } from '../depenses/_components/paiements/occurrence-list';

export function WeeklyReminderCard({
  reminder,
  readOnly = false,
}: {
  reminder: WeeklyReminder;
  readOnly?: boolean;
}) {
  const { from, to, count, remaining, items } = reminder;
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" aria-hidden />À payer cette semaine
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {formatDay(from)} → {formatDay(to)}
          {count > 0 &&
            ` · ${count} échéance${count > 1 ? 's' : ''} · ${money(remaining)} restant`}
        </p>
      </CardHeader>
      <CardContent>
        <OccurrenceList
          occurrences={items}
          readOnly={readOnly}
          emptyLabel="Rien à payer cette semaine"
        />
      </CardContent>
    </Card>
  );
}
