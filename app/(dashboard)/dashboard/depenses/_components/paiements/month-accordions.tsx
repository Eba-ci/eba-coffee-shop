'use client';

// Échéances en retard regroupées par mois : un accordéon par mois, le plus
// récent ouvert. L'état d'ouverture est propre à chaque mois ; la sélection
// multiple vit dans `OccurrenceList` (un seul hook), donc elle traverse les
// accordéons, y compris repliés.

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { groupOccurrencesByMonth, monthTitle } from '@/lib/fixed-costs/group';
import { money } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';

export function MonthAccordions({
  occurrences,
  renderRow,
}: {
  occurrences: Occurrence[];
  renderRow: (o: Occurrence) => ReactNode;
}) {
  const baseId = useId();
  const groups = groupOccurrencesByMonth(occurrences);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(groups.slice(0, 1).map((g) => g.month))
  );
  const toggle = (m: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(m)) next.add(m);
      return next;
    });

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = open.has(g.month);
        const panelId = `${baseId}-${g.month}`;
        return (
          <section key={g.month} className="rounded-lg border">
            <h3>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(g.month)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium capitalize">
                    {monthTitle(g.month)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {g.count} échéance{g.count > 1 ? 's' : ''} · reste{' '}
                    {money(g.remaining)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
              </button>
            </h3>
            <ul id={panelId} hidden={!isOpen} className="divide-y border-t">
              {g.occurrences.map(renderRow)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
