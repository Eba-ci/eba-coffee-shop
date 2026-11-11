'use client';

import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { formatDayLong } from '@/lib/fixed-costs/format';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { OccurrenceList } from './occurrence-list';

/** Détail d'un jour du calendrier : ses échéances et l'action de paiement. */
export function DayOccurrencesSheet({
  date,
  occurrences,
  month,
  onClose,
}: {
  date: string | null;
  occurrences: Occurrence[];
  month: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {date && (
          <>
            <SheetHeader>
              <SheetTitle className="first-letter:uppercase">
                {formatDayLong(date)}
              </SheetTitle>
              <SheetDescription>
                Échéances de charges fixes de ce jour.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <OccurrenceList
                occurrences={occurrences}
                month={month}
                showDay={false}
                emptyLabel="Aucune échéance ce jour-là."
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
