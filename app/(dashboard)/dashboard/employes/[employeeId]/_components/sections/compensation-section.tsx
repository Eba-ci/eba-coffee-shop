// « Rémunération » (#442) : taux en vigueur puis historique daté (jamais
// écrasé). Le montant reste aligné à droite en `tabular-nums`.

import { money } from '@/lib/fixed-costs/format';
import type { Employee360 } from '@/lib/employees/queries';
import { Field, SectionCard } from './section-card';

export function CompensationSection({ employee }: { employee: Employee360 }) {
  return (
    <SectionCard
      title="Rémunération"
      description="Montant mensuel applicable, et l'historique des changements."
    >
      <dl>
        <Field
          label="Taux en vigueur"
          value={
            employee.currentRate === null
              ? 'Aucun taux'
              : `${money(employee.currentRate)} / mois`
          }
        />
      </dl>
      {employee.rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun taux défini : le dû de cet employé est de 0 F.
        </p>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Historique des taux
          </p>
          <ul className="mt-1 divide-y">
            {employee.rates.map((rate) => (
              <li
                key={rate.startDate}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">
                  Depuis le {rate.startDate}
                </span>
                <span className="font-medium tabular-nums">
                  {money(rate.monthlyAmount)} / mois
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}