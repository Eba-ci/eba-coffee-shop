// Bande de synthèse (#442) : présentation PURE, partagée par la fiche (version
// complète) et la liste (version condensée). Aucun calcul de paie : dû, versé,
// reste, arriéré et solde d'avance viennent du ledger (`getEmployee360` /
// `listEmployeesOverview`) ; ici on ne choisit qu'un libellé, une icône et un
// badge sémantique. La couleur ne porte jamais l'information seule.

import {
  AlertCircle,
  CheckCircle2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/fixed-costs/format';
import {
  SETTLEMENT_STATE_LABELS,
  settlementState,
  type SettlementState,
} from '@/lib/employees/format';
import { cn } from '@/lib/utils';
import { EmployeeAvatar } from './employee-avatar';
import { EmploymentBadge } from './employee-badges';

export const SETTLEMENT_STATE_META: Record<
  SettlementState,
  { Icon: LucideIcon; variant: 'default' | 'secondary' | 'destructive' }
> = {
  settled: { Icon: CheckCircle2, variant: 'default' },
  partial: { Icon: AlertCircle, variant: 'secondary' },
  late: { Icon: TriangleAlert, variant: 'destructive' },
};

export function SettlementBadge({ state }: { state: SettlementState }) {
  const { Icon, variant } = SETTLEMENT_STATE_META[state];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {SETTLEMENT_STATE_LABELS[state]}
    </Badge>
  );
}

export type SalarySummaryValues = {
  due: number;
  paid: number;
  remainingToPay: number;
  arrearsTotal: number;
  advanceBalance: number;
};

type SummaryEmployee = {
  name: string;
  position: string | null;
  active: boolean;
  endDate: string | null;
};

function Value({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 whitespace-nowrap tabular-nums',
          strong ? 'text-lg font-semibold' : 'text-sm font-medium'
        )}
      >
        {money(value)}
      </dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Bande complète : nom, poste, statut puis les cinq montants de synthèse. */
export function SalarySummaryBand({
  employee,
  values,
  monthLabel,
}: {
  employee: SummaryEmployee;
  values: SalarySummaryValues;
  monthLabel: string;
}) {
  const state = settlementState(values);
  return (
    <section
      aria-label="Synthèse de la paie"
      className="rounded-lg border bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <EmployeeAvatar name={employee.name} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{employee.name}</h2>
            <SettlementBadge state={state} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {employee.position || 'Poste non renseigné'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <EmploymentBadge
              active={employee.active}
              endDate={employee.endDate}
            />
            <span className="text-xs text-muted-foreground">{monthLabel}</span>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-3">
        <Value label="Dû du mois" value={values.due} />
        <Value label="Versé" value={values.paid} />
        <Value
          label="Reste à payer"
          value={values.remainingToPay}
          strong
          hint={SETTLEMENT_STATE_LABELS[state]}
        />
        <Value
          label="Arriéré"
          value={values.arrearsTotal}
          hint={values.arrearsTotal > 0 ? 'Mois clôturés' : 'À jour'}
        />
        <Value
          label="Solde d’avance"
          value={values.advanceBalance}
          hint={values.advanceBalance > 0 ? 'À récupérer' : 'Aucune avance'}
        />
      </dl>
    </section>
  );
}

/** Version condensée de la liste : Dû / Versé / Reste, sans avatar ni actions. */
export function SalarySummaryCompact({
  values,
  className,
}: {
  values: SalarySummaryValues;
  className?: string;
}) {
  const state = settlementState(values);
  return (
    <div className={cn('space-y-2', className)}>
      <dl className="grid grid-cols-3 gap-x-3 text-sm">
        <Value label="Dû" value={values.due} />
        <Value label="Versé" value={values.paid} />
        <Value label="Reste" value={values.remainingToPay} strong />
      </dl>
      <div className="flex flex-wrap items-center gap-1.5">
        <SettlementBadge state={state} />
      </div>
    </div>
  );
}