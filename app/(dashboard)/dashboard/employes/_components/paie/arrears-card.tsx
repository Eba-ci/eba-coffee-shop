// Carte « Arriéré » de la fiche employé (#444) : mois clôturés non soldés.
// Aucune règle de calcul : le total et les mois viennent du serveur.

import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import type { SalaryArrears } from '@/lib/salaries/types';

export function ArrearsCard({ arrears }: { arrears?: SalaryArrears }) {
  const count = arrears?.months.length ?? 0;
  return (
    <section className="rounded-lg border p-3" aria-label="Arriéré">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Arriéré</p>
        {count > 0 ? (
          <Badge variant="secondary">Impayé</Badge>
        ) : (
          <Badge variant="outline">À jour</Badge>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold">{money(arrears?.total ?? 0)}</p>
      <p className="text-xs text-muted-foreground">
        {count === 0
          ? 'Aucun mois clôturé impayé.'
          : `${count} mois concerné${count > 1 ? 's' : ''}${
              arrears?.oldestMonth
                ? ` · plus ancien : ${monthLabel(arrears.oldestMonth)}`
                : ''
            }`}
      </p>
      {arrears && count > 0 && (
        <ul className="mt-2 divide-y rounded-md border text-sm">
          {arrears.months.map((m) => (
            <li
              key={m.month}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="capitalize text-muted-foreground">
                {monthLabel(m.month)}
              </span>
              <span className="font-medium">{money(m.remaining)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
