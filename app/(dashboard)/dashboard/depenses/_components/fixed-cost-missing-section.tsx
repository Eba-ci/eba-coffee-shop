import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { getMissingFixedCostPeriods } from '@/lib/fixed-costs/queries';
import { formatPeriodLabel } from '@/lib/fixed-costs/format';
import { Button } from '@/components/ui/button';

/**
 * Bandeau : périodes échues d'une charge fixe où aucune dépense de sa
 * catégorie n'a été saisie (le mois en cours n'alerte jamais).
 */
export async function FixedCostMissingSection() {
  const missing = await getMissingFixedCostPeriods();
  if (missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <BellRing className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Charges fixes sans dépense saisie :
        </span>
        <div className="flex flex-wrap gap-2">
          {missing.map((m) => (
            <Button
              key={`${m.costId}-${m.periodStart}`}
              asChild
              size="sm"
              variant="outline"
              className="h-9 border-amber-300 bg-background"
            >
              <Link
                href={`/dashboard/depenses/nouvelle?chargefixe=${m.costId}`}
              >
                {m.label} · {formatPeriodLabel(m.periodStart, m.periodEnd)}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
