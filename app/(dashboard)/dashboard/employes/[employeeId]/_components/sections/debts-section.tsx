// « Dettes et avances » (#442) : arriéré des mois clôturés puis solde
// d'avance. L'arriéré porte le badge « en retard », jamais la couleur seule.

import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { settlementState } from '@/lib/employees/format';
import type { Employee360 } from '@/lib/employees/queries';
import { SettlementBadge } from '../../../_components/salary-summary';
import { ArrearsSettle } from '../../../_components/arrears/arrears-settle';
import { OverpaidBonusButton } from '../../../_components/arrears/overpaid-bonus-button';
import { Field, SectionCard } from './section-card';

export function DebtsSection({
  employee,
  canSettle = false,
  today,
}: {
  employee: Employee360;
  /** ADMIN : règlement par lot et bonus. Sinon, lecture seule. */
  canSettle?: boolean;
  today?: string;
}) {
  const state = settlementState({
    remainingToPay: employee.month.remainingToPay,
    arrearsTotal: employee.arrears.total,
  });

  return (
    <SectionCard
      title="Dettes et avances"
      description="Mois clôturés impayés et avances restant à récupérer."
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          Arriéré (mois clôturés)
        </span>
        <span className="flex items-center gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {money(employee.arrears.total)}
          </span>
          {employee.arrears.total > 0 && <SettlementBadge state={state} />}
        </span>
      </div>
      {canSettle && today && employee.arrears.months.length > 0 ? (
        <ArrearsSettle
          employeeId={employee.id}
          employeeName={employee.name}
          currentMonth={employee.month.month}
          today={today}
          months={employee.arrears.months}
        />
      ) : employee.arrears.months.length > 0 ? (
        <ul className="divide-y rounded-lg border text-sm">
          {employee.arrears.months.map((month) => (
            <li
              key={month.month}
              className="flex items-baseline justify-between gap-3 px-3 py-2"
            >
              <span className="text-muted-foreground">
                {monthLabel(month.month)}
              </span>
              <span className="font-medium tabular-nums">
                {money(month.remaining)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun mois clôturé impayé.
        </p>
      )}
      {canSettle && employee.month.overpaid > 0 && (
        <OverpaidBonusButton
          employeeId={employee.id}
          month={employee.month.month}
          overpaid={employee.month.overpaid}
        />
      )}
      {employee.proposedPayment.total > 0 && (
        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          Proposé au paiement :{' '}
          <span className="font-semibold tabular-nums">
            {money(employee.proposedPayment.total)}
          </span>
          <span className="block text-xs text-muted-foreground">
            Mois courant + arriéré, hors base du point mort.
          </span>
        </p>
      )}
      <dl className="border-t pt-3">
        <Field
          label="Avance restant à récupérer"
          value={money(employee.advanceBalance)}
        />
      </dl>
      {employee.advanceBalance === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune avance à récupérer.
        </p>
      )}
    </SectionCard>
  );
}
