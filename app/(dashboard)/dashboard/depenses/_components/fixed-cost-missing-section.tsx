import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { getLateFixedCostOccurrences } from '@/lib/fixed-costs/queries';
import { formatDay } from '@/lib/fixed-costs/format';
import { Button } from '@/components/ui/button';

/**
 * Bandeau : échéances de charges fixes dont la date est passée sans dépense
 * liée (une échéance du jour ou à venir n'alerte jamais).
 */
export async function FixedCostMissingSection() {
  const missing = await getLateFixedCostOccurrences();
  if (missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <BellRing className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Échéances de charges fixes en retard :
        </span>
        <div className="flex flex-wrap gap-2">
          {missing.map((m) => (
            <Button
              key={`${m.costId}-${m.dueDate}`}
              asChild
              size="sm"
              variant="outline"
              className="h-9 border-amber-300 bg-background"
            >
              <Link
                href={`/dashboard/depenses/nouvelle?chargefixe=${m.costId}&echeance=${m.dueDate}`}
              >
                {m.label} · échue le {formatDay(m.dueDate)}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
