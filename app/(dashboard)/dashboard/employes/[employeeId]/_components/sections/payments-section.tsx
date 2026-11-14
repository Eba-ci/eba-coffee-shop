// « Derniers versements » (#442) : une ligne par versement, montant aligné à
// droite, secondaire en gris. L'historique n'est jamais effacé (annulés
// compris côté données).

import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { SALARY_PAYMENT_TYPE_LABELS } from '@/lib/employees/format';
import type { Employee360 } from '@/lib/employees/queries';
import { SectionCard } from './section-card';

export function PaymentsSection({ employee }: { employee: Employee360 }) {
  return (
    <SectionCard
      title="Derniers versements"
      description="Salaires, acomptes et avances enregistrés, du plus récent au plus ancien."
    >
      {employee.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun versement enregistré pour cet employé.
        </p>
      ) : (
        <ul className="divide-y">
          {employee.payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-start justify-between gap-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {SALARY_PAYMENT_TYPE_LABELS[payment.type]}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {monthLabel(payment.month)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Le {payment.date}
                  {payment.note ? ` · ${payment.note}` : ''}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {money(payment.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}