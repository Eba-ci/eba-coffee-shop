// « Situation du mois » (#442) : dû, primes, retenues, versé, reste. Le détail
// secondaire reste en gris ; le reste à payer porte l'état sémantique.

import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import type { Employee360 } from '@/lib/employees/queries';
import { SettlementBadge } from '../../../_components/salary-summary';
import { settlementState } from '@/lib/employees/format';
import { Field, SectionCard } from './section-card';

export function MonthSection({ employee }: { employee: Employee360 }) {
  const { month } = employee;
  const state = settlementState({
    remainingToPay: month.remainingToPay,
    arrearsTotal: employee.arrears.total,
  });
  return (
    <SectionCard
      title={`Situation de ${monthLabel(month.month)}`}
      description="Détail du dû et des versements du mois affiché."
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Reste à payer</span>
        <span className="flex items-center gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {money(month.remainingToPay)}
          </span>
          <SettlementBadge state={state} />
        </span>
      </div>
      <dl className="space-y-1.5 border-t pt-3">
        <Field label="Base (taux proratisés)" value={money(month.baseDue)} />
        <Field label="Primes" value={money(month.primes)} />
        <Field label="Retenues" value={money(month.retenues)} />
        <Field label="Dû du mois" value={money(month.due)} />
        <Field label="Salaires versés" value={money(month.salariesPaid)} />
        <Field label="Acomptes versés" value={money(month.advancesPaid)} />
        <Field
          label="Avances récupérées"
          value={money(month.advanceRecovered)}
        />
        {month.overpaid > 0 && (
          <Field label="Excédent versé" value={money(month.overpaid)} />
        )}
      </dl>
    </SectionCard>
  );
}
